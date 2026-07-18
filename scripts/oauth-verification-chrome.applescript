on focusGhostty()
  tell application "Ghostty"
    activate
    if (count of windows) is greater than 0 then activate window front window
  end tell
end focusGhostty

on confirmGhosttyPrompt()
  tell application "Ghostty"
    activate
    set targetTerminal to focused terminal of selected tab of front window
    send key "enter" to targetTerminal
  end tell
end confirmGhosttyPrompt

on performGhosttyAction(actionName)
  tell application "Ghostty"
    activate
    set targetTerminal to focused terminal of selected tab of front window
    perform action actionName on targetTerminal
  end tell
end performGhosttyAction

on waitForPageLoad(timeoutSeconds)
  set startedAt to current date
  repeat
    tell application "Google Chrome"
      if (count of windows) is 0 then return false
      set pageIsLoading to loading of active tab of front window
    end tell
    if pageIsLoading is false then return true
    if ((current date) - startedAt) is greater than or equal to timeoutSeconds then return false
    delay 0.5
  end repeat
end waitForPageLoad

on waitForWindowLoad(targetWindow, timeoutSeconds)
  set startedAt to current date
  repeat
    set anyTabIsLoading to false
    tell application "Google Chrome"
      repeat with targetTab in tabs of targetWindow
        if loading of targetTab is true then set anyTabIsLoading to true
      end repeat
    end tell
    if anyTabIsLoading is false then return true
    if ((current date) - startedAt) is greater than or equal to timeoutSeconds then return false
    delay 0.5
  end repeat
end waitForWindowLoad

on prepareUrls(urlsToLoad, timeoutSeconds)
  if (count of urlsToLoad) is 0 then error "Expected at least one URL."
  tell application "Google Chrome"
    activate
    set demoWindow to make new window
    set URL of active tab of demoWindow to item 1 of urlsToLoad
    if (count of urlsToLoad) is greater than 1 then
      repeat with urlIndex from 2 to count of urlsToLoad
        make new tab at end of tabs of demoWindow with properties {URL:item urlIndex of urlsToLoad}
      end repeat
    end if
    set active tab index of demoWindow to 1
  end tell
  delay 0.2
  my waitForWindowLoad(demoWindow, timeoutSeconds)
  delay 2
end prepareUrls

on selectPreparedUrl(targetUrl)
  tell application "Google Chrome"
    repeat with windowIndex from 1 to count of windows
      set candidateWindow to window windowIndex
      repeat with tabIndex from 1 to count of tabs of candidateWindow
        set candidateUrl to URL of tab tabIndex of candidateWindow
        if candidateUrl starts with targetUrl then
          set active tab index of candidateWindow to tabIndex
          try
            set index of candidateWindow to 1
          end try
          activate
          return true
        end if
      end repeat
    end repeat
  end tell
  return false
end selectPreparedUrl

on showUrl(targetUrl, timeoutSeconds)
  set foundPreparedTab to my selectPreparedUrl(targetUrl)
  if foundPreparedTab is false then
    tell application "Google Chrome"
      activate
      if (count of windows) is 0 then make new window
      tell front window
        make new tab with properties {URL:targetUrl}
        set active tab index to count of tabs
      end tell
    end tell
  end if
  delay 0.2
  my waitForPageLoad(timeoutSeconds)
  delay 0.4
end showUrl

on run argv
  if (count of argv) is 0 then error "Expected an action."
  set actionName to item 1 of argv

  if actionName is "check" then
    tell application "Google Chrome" to set chromeVersion to version
    tell application "Ghostty" to set ghosttyVersion to version
    tell application "System Events" to set accessibilityEnabled to UI elements enabled
    return accessibilityEnabled
  else if actionName is "prepare" then
    if (count of argv) is less than 3 then error "Expected a timeout and at least one URL."
    set timeoutSeconds to (item 2 of argv) as integer
    set urlsToLoad to items 3 thru -1 of argv
    my prepareUrls(urlsToLoad, timeoutSeconds)
  else if actionName is "show" then
    if (count of argv) is less than 2 then error "Expected a URL."
    set timeoutSeconds to 60
    if (count of argv) is greater than 2 then set timeoutSeconds to (item 3 of argv) as integer
    my showUrl(item 2 of argv, timeoutSeconds)
  else if actionName is "active-url" then
    tell application "Google Chrome"
      if (count of windows) is 0 then return ""
      return URL of active tab of front window
    end tell
  else if actionName is "focus-terminal" then
    my focusGhostty()
  else if actionName is "confirm-terminal" then
    my confirmGhosttyPrompt()
  else if actionName is "terminal-action" then
    if (count of argv) is less than 2 then error "Expected a Ghostty action."
    my performGhosttyAction(item 2 of argv)
  else
    error "Unknown action: " & actionName
  end if
end run
