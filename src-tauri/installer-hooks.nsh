; Inkwell installer hooks — set up the firewall so device sync works out of the box.
; Runs elevated as part of a per-machine install, so no scripts or prompts for the user later.

!macro NSIS_HOOK_POSTINSTALL
  ; allow other devices on your own network to reach Inkwell's sync port (idempotent: clear then add)
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Inkwell Device Sync"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Inkwell Device Sync" dir=in action=allow protocol=TCP localport=8787 profile=private,domain'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Inkwell Device Sync"'
!macroend
