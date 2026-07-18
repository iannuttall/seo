on run argv
  if (count of argv) is less than 2 then error "Expected a working directory and demo command."

  set workingDirectory to item 1 of argv
  set demoCommand to item 2 of argv
  set shellCommand to "/bin/zsh -lc " & quoted form of demoCommand

  tell application "Ghostty"
    activate
    set surfaceConfig to new surface configuration from {font size:22, initial working directory:workingDirectory, command:shellCommand, wait after command:false}
    set demoWindow to new window with configuration surfaceConfig
    activate window demoWindow
    set demoTerminal to focused terminal of selected tab of demoWindow
    focus demoTerminal
    delay 0.5
    focus demoTerminal
  end tell
end run
