// Web clipping without a third party: the desktop app fetches the page itself and the webview turns
// the HTML into markdown. The webview can't fetch arbitrary pages (CORS + CSP), and must not be able
// to reach the user's own machine or LAN through this command (SSRF), so every hop is checked here.
use serde::Serialize;
use std::io::Read;
use std::net::{IpAddr, ToSocketAddrs};
use std::time::{Duration, Instant};
use url::{Host, Url};

/// Redirects followed (each one re-checked) before giving up.
const MAX_REDIRECTS: usize = 5;
/// The whole fetch, redirects and body included.
const TIMEOUT: Duration = Duration::from_secs(20);
/// Larger pages are refused rather than clipped half-way.
const MAX_BODY: u64 = 5 * 1024 * 1024;

#[derive(Serialize)]
pub struct FetchedPage {
    final_url: String,
    html: String,
}

/// `url` as a web address the clipper may fetch: http(s) only, never a local / private host.
/// (The name is checked here; what it resolves to is checked again at connect time, see `fetch`.)
pub(crate) fn check_url(url: &str) -> Result<Url, String> {
    let u = Url::parse(url.trim()).map_err(|_| format!("Not a web address: {url}"))?;
    if u.scheme() != "http" && u.scheme() != "https" {
        return Err(format!("Only http and https pages can be clipped: {url}"));
    }
    let refused = || Err(format!("Refusing to fetch a local or private address: {url}"));
    match u.host() {
        None => return Err(format!("Not a web address: {url}")),
        Some(Host::Domain(d)) => {
            let d = d.trim_end_matches('.').to_ascii_lowercase();
            let local = d.is_empty()
                || d == "localhost"
                || d.ends_with(".localhost")
                || d == "local"
                || d.ends_with(".local");
            if local {
                return refused();
            }
        }
        Some(Host::Ipv4(ip)) => {
            if ip_blocked(IpAddr::V4(ip)) {
                return refused();
            }
        }
        Some(Host::Ipv6(ip)) => {
            if ip_blocked(IpAddr::V6(ip)) {
                return refused();
            }
        }
    }
    Ok(u)
}

/// An address on this machine, the LAN, or otherwise not on the public internet.
pub(crate) fn ip_blocked(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, c, _] = v4.octets();
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_multicast()
                || v4.is_documentation()
                || a == 0 // "this network"
                || (a == 100 && (64..128).contains(&b)) // carrier-grade NAT
                || (a == 192 && b == 0 && c == 0) // IETF protocol assignments
                || (a == 198 && (b == 18 || b == 19)) // benchmarking
                || a >= 240 // reserved
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return ip_blocked(IpAddr::V4(v4));
            }
            let s = v6.segments();
            // NAT64 (64:ff9b::/96) carries an IPv4 address in its last 32 bits
            if s[0] == 0x64 && s[1] == 0xff9b && s[2..6].iter().all(|&x| x == 0) {
                let [.., hi, lo] = s;
                let v4 = std::net::Ipv4Addr::new((hi >> 8) as u8, hi as u8, (lo >> 8) as u8, lo as u8);
                return ip_blocked(IpAddr::V4(v4));
            }
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (s[0] & 0xfe00) == 0xfc00 // unique local
                || (s[0] & 0xffc0) == 0xfe80 // link-local
                || (s[0] & 0xffc0) == 0xfec0 // old site-local
                || (s[0] == 0x2001 && s[1] == 0x0db8) // documentation
                || s[..6].iter().all(|&x| x == 0) // IPv4-compatible ::a.b.c.d
        }
    }
}

/// Only HTML pages are clipped (no PDFs, images, downloads).
pub(crate) fn is_html(content_type: &str) -> bool {
    let mime = content_type.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    mime == "text/html" || mime == "application/xhtml+xml"
}

/// Where a redirect from `current` to `location` goes — checked like the first URL.
pub(crate) fn next_hop(current: &Url, location: &str) -> Result<Url, String> {
    let next = current.join(location).map_err(|_| format!("Bad redirect: {location}"))?;
    check_url(next.as_str())
}

/// DNS for the clipper: a name that resolves to any local/private address is refused at connect
/// time, so a public-looking name (or a DNS rebind between check and connect) can't reach the LAN.
fn public_only(netloc: &str) -> std::io::Result<Vec<std::net::SocketAddr>> {
    let addrs: Vec<_> = netloc.to_socket_addrs()?.collect();
    if addrs.iter().any(|a| ip_blocked(a.ip())) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "refusing to connect: the name resolves to a local or private address",
        ));
    }
    Ok(addrs)
}

/// Fetch one HTML page, following at most `MAX_REDIRECTS` redirects by hand (each re-checked).
pub(crate) fn fetch(url: &str) -> Result<FetchedPage, String> {
    let deadline = Instant::now() + TIMEOUT;
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .resolver(public_only)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Inkwell/0.1 (web clipper)")
        .build();
    let mut current = check_url(url)?;
    for _ in 0..=MAX_REDIRECTS {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return Err("Timed out — the page took too long.".into());
        }
        let resp = match agent
            .get(current.as_str())
            .timeout(left)
            .set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1")
            .call()
        {
            Ok(r) => r,
            Err(ureq::Error::Status(code, _)) => return Err(format!("The site answered {code}.")),
            Err(e) => return Err(e.to_string()),
        };
        if (300..400).contains(&resp.status()) {
            let loc = resp.header("location").ok_or("The site redirected without saying where.")?;
            current = next_hop(&current, loc)?;
            continue;
        }
        let ct = resp.header("content-type").unwrap_or("").to_string();
        if !is_html(&ct) {
            return Err(format!("Not a web page ({}) — only HTML pages can be clipped.", if ct.is_empty() { "no type" } else { &ct }));
        }
        let mut body = Vec::new();
        resp.into_reader()
            .take(MAX_BODY + 1)
            .read_to_end(&mut body)
            .map_err(|e| e.to_string())?;
        if body.len() as u64 > MAX_BODY {
            return Err("The page is larger than 5 MB — too big to clip.".into());
        }
        return Ok(FetchedPage {
            final_url: current.to_string(),
            html: String::from_utf8_lossy(&body).into_owned(),
        });
    }
    Err(format!("Too many redirects (more than {MAX_REDIRECTS})."))
}

/// Fetch a web page for the clipper (http/https only, never local or private addresses).
#[tauri::command]
pub async fn fetch_page(url: String) -> Result<FetchedPage, String> {
    tauri::async_runtime::spawn_blocking(move || fetch(&url))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_web_pages_are_allowed() {
        for ok in [
            "https://example.com",
            "http://example.com/a/b?c=d#e",
            "https://en.wikipedia.org/wiki/Note-taking",
            "https://93.184.215.14/",
            "https://[2606:4700::1111]/",
        ] {
            assert!(check_url(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn other_schemes_are_refused() {
        for bad in ["file:///C:/Windows/win.ini", "ftp://example.com", "javascript:alert(1)", "data:text/html,x", "example.com", ""] {
            assert!(check_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn local_and_private_hosts_are_refused() {
        for bad in [
            "http://localhost/",
            "http://LOCALHOST:8080/",
            "http://app.localhost/",
            "http://printer.local/",
            "http://nas.LOCAL./",
            "http://127.0.0.1/",
            "http://127.1/",
            "http://2130706433/",
            "http://0x7f000001/",
            "http://0.0.0.0/",
            "http://10.0.0.5/",
            "http://172.16.3.4/",
            "http://172.31.255.255/",
            "http://192.168.1.1/",
            "http://169.254.169.254/latest/meta-data",
            "http://100.64.0.1/",
            "http://[::1]/",
            "http://[::]/",
            "http://[fe80::1]/",
            "http://[fd00::1]/",
            "http://[::ffff:127.0.0.1]/",
            "http://[::ffff:192.168.0.1]/",
            "http://224.0.0.1/",
            "http://255.255.255.255/",
            "http://user:pw@127.0.0.1/",
        ] {
            assert!(check_url(bad).is_err(), "should refuse {bad}");
        }
    }

    #[test]
    fn public_addresses_are_not_blocked() {
        for ok in ["93.184.215.14", "1.1.1.1", "172.32.0.1", "2606:4700::1111"] {
            assert!(!ip_blocked(ok.parse().unwrap()), "{ok}");
        }
    }

    #[test]
    fn redirects_are_checked_like_the_first_url() {
        let from = check_url("https://example.com/a/b").unwrap();
        assert_eq!(next_hop(&from, "/c").unwrap().as_str(), "https://example.com/c");
        assert_eq!(next_hop(&from, "https://www.iana.org/x").unwrap().as_str(), "https://www.iana.org/x");
        for bad in ["http://127.0.0.1/", "http://localhost:3000/", "http://192.168.0.1/admin", "file:///C:/x", "http://[::1]/"] {
            assert!(next_hop(&from, bad).is_err(), "should refuse a redirect to {bad}");
        }
    }

    #[test]
    fn names_resolving_to_local_addresses_are_refused_at_connect_time() {
        assert!(public_only("localhost:80").is_err());
        assert!(public_only("127.0.0.1:80").is_err());
        assert!(public_only("[::1]:443").is_err());
        assert!(public_only("1.1.1.1:443").is_ok());
    }

    #[test]
    fn fetching_a_local_address_is_refused_before_any_request() {
        let e = fetch("http://127.0.0.1:9/").err().unwrap();
        assert!(e.contains("local or private"), "{e}");
    }

    /// Needs the internet: `cargo test web:: -- --ignored`
    #[test]
    #[ignore]
    fn live_fetch_returns_html_and_refuses_non_html() {
        let page = fetch("http://example.com").unwrap();
        assert!(page.html.to_lowercase().contains("<title>"), "{}", &page.html[..200.min(page.html.len())]);
        assert!(fetch("https://www.iana.org/favicon.ico").is_err(), "an image is not a web page");
    }

    #[test]
    fn only_html_is_clipped() {
        for ok in ["text/html", "text/html; charset=utf-8", "TEXT/HTML", "application/xhtml+xml"] {
            assert!(is_html(ok), "{ok}");
        }
        for bad in ["application/pdf", "image/png", "application/octet-stream", "text/plain", ""] {
            assert!(!is_html(bad), "{bad}");
        }
    }
}
