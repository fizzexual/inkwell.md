import { useEffect } from "react";
import { Download } from "lucide-react";
import { useUpdater } from "../updater/useUpdater";
import { scheduleAutoCheck } from "../updater/logic";
import { inTauri } from "../tauri";
import "./UpdateBanner.css";

/** A calm, persistent card: "Inkwell X.Y.Z is available — Install & restart". Never installs on its own. */
export default function UpdateBanner() {
  const phase = useUpdater((s) => s.phase);
  const text = useUpdater((s) => s.text);
  const install = useUpdater((s) => s.install);
  const dismiss = useUpdater((s) => s.dismiss);

  // one silent check ~10 s after launch, in the installed app only
  useEffect(
    () =>
      scheduleAutoCheck({ inTauri, prod: import.meta.env.PROD }, () => {
        void useUpdater.getState().checkForUpdates("auto");
      }),
    [],
  );

  if (phase !== "available" && phase !== "downloading" && phase !== "installing") return null;
  const working = phase !== "available";

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <Download size={15} className="update-icon" />
      <span className="update-text">{text}</span>
      {!working && (
        <>
          <button className="update-install" onClick={() => void install()}>
            Install &amp; restart
          </button>
          <button className="update-later" onClick={dismiss}>
            Later
          </button>
        </>
      )}
    </div>
  );
}
