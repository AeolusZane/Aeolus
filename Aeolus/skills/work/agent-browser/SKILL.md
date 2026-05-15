---
name: agent-browser
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.
---

# Browser Automation with agent-browser

## Installation

```bash
npm install -g agent-browser
agent-browser install
```

## Core workflow

1. Navigate: `agent-browser open <url>`
2. Snapshot: `agent-browser snapshot -i` (returns elements with refs like `@e1`, `@e2`)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

**Important**: refs are page-scoped and expire after navigation — always re-snapshot after page changes.

## Commands

### Navigation
```bash
agent-browser open <url>
agent-browser back
agent-browser forward
agent-browser reload
agent-browser close
```

### Snapshot
```bash
agent-browser snapshot          # Full accessibility tree
agent-browser snapshot -i       # Interactive elements only (recommended)
agent-browser snapshot -c       # Compact output
agent-browser snapshot -d 3     # Limit depth
agent-browser snapshot -s "#id" # Scope to CSS selector
```

### Interactions (use @refs from snapshot)
```bash
agent-browser click @e1
agent-browser fill @e2 "text"       # Clear then type
agent-browser type @e2 "text"       # Type without clearing
agent-browser press Enter
agent-browser press Control+a
agent-browser hover @e1
agent-browser check @e1
agent-browser select @e1 "value"
agent-browser scroll down 500
agent-browser drag @e1 @e2
agent-browser upload @e1 file.pdf
```

### Semantic locators (no snapshot needed)
```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find first ".item" click
```

### Get information
```bash
agent-browser get text @e1
agent-browser get value @e1
agent-browser get attr @e1 href
agent-browser get title
agent-browser get url
```

### Screenshots & PDF
```bash
agent-browser screenshot
agent-browser screenshot path.png
agent-browser screenshot --full
agent-browser pdf output.pdf
```

### Wait
```bash
agent-browser wait @e1
agent-browser wait 2000
agent-browser wait --text "Success"
agent-browser wait --url "**/dashboard"
agent-browser wait --load networkidle
```

### Session state
```bash
agent-browser state save auth.json   # Save cookies/storage
agent-browser state load auth.json   # Restore saved session
```

### Tabs & Frames
```bash
agent-browser tab new [url]
agent-browser tab 2
agent-browser frame "#iframe"
agent-browser frame main
```

### Network
```bash
agent-browser network route <url> --abort     # Block requests
agent-browser network route <url> --body '{}' # Mock response
agent-browser network requests                # View tracked requests
```

### Browser settings
```bash
agent-browser set viewport 1920 1080
agent-browser set device "iPhone 14"
agent-browser set media dark
```

### JavaScript
```bash
agent-browser eval "document.title"
```

## Example: Login + form submission

```bash
agent-browser open https://example.com/login
agent-browser snapshot -i
# Output: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Login" [ref=e3]

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle

# Page changed — re-snapshot
agent-browser snapshot -i
agent-browser fill @e7 "search query"
agent-browser screenshot result.png
```

## Example: Save and reuse login state

```bash
# Login once and save
agent-browser open https://app.com/login
agent-browser find label "Email" fill "user@example.com"
agent-browser find label "Password" fill "password123"
agent-browser find role button click --name "Login"
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json

# Next session: skip login
agent-browser state load auth.json
agent-browser open https://app.com/dashboard
```

## Debugging
```bash
agent-browser open example.com --headed   # Show browser window
agent-browser console                     # View console messages
agent-browser errors                      # View page errors
agent-browser highlight @e1               # Highlight element
```
