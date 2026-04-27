# QA Screenshot Skill

Takes screenshots of websites at multiple device sizes for visual QA testing.

## Context

You are a forked agent with no conversation history. Your job is to capture screenshots of a website for visual QA testing and organize them in the qa-bot repository.

## What You'll Receive

The caller will pass you a complete task description like:
- `Take screenshots of https://example.com and save to site-testing/example/screenshots`
- `Capture screenshots for https://keylistings.com/customers/duwest in qa-bot repo`

The argument will include:
1. The URL to screenshot
2. Where to save them (relative to qa-bot repo root)

## Your Task

1. **Navigate to the qa-bot repository**
   ```bash
   cd /root/code/qa-bot
   ```

2. **Run the screenshot tool**
   ```bash
   npm run screenshot <url> <output-dir>
   ```

   Example:
   ```bash
   npm run screenshot https://keylistings.com/customers/duwest site-testing/keylistings/customers/duwest/screenshots
   ```

3. **Create/update the screenshots README**
   The README should be at `<output-dir>/README.md` and follow this template:

   ```markdown
   # Screenshots - [Site Name]

   Visual testing across common device sizes for [URL]

   **Quick Links:** [Mobile](#mobile) • [Tablet](#tablet) • [Desktop](#desktop)

   ---

   <a name="mobile"></a>
   ## Mobile

   | iPhone SE/8 (375x667) | iPhone XR/11 (414x896) |
   |:---------------------:|:----------------------:|
   | ![Mobile](mobile.png) | ![Mobile Large](mobile-large.png) |

   ---

   <a name="tablet"></a>
   ## Tablet

   | iPad Portrait (768x1024) | iPad Landscape (1024x768) |
   |:------------------------:|:-------------------------:|
   | ![Tablet](tablet.png) | ![Tablet Landscape](tablet-landscape.png) |

   ---

   <a name="desktop"></a>
   ## Desktop

   | MacBook Pro (1440x900) | Full HD (1920x1080) |
   |:----------------------:|:-------------------:|
   | ![Desktop Laptop](desktop-laptop.png) | ![Desktop](desktop.png) |

   ---

   **Captured:** YYYY-MM-DD
   **Tool:** Puppeteer headless browser (2x device scale for retina quality)
   **Coverage:** Above-the-fold + one scroll (~1.5x viewport height)
   ```

4. **Commit and push**
   ```bash
   git add -A
   git commit -m "Add screenshots for [Site Name]

   Captured visual testing screenshots at 6 common viewport sizes.

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
   git push
   ```

5. **Report back**
   Tell the main thread:
   - How many screenshots were captured
   - Total file size
   - Where they're saved
   - Link to the screenshots README on GitHub

## Technical Details

The screenshot tool (`scripts/screenshot.ts`) captures:
- **6 viewport sizes**: mobile, mobile-large, tablet, tablet-landscape, desktop-laptop, desktop
- **1.5x viewport height**: Shows above-the-fold + one scroll worth of content
- **2x device scale**: Retina/high-DPI for crisp quality
- **File sizes**: Typically 500KB - 5MB per screenshot

## Example Invocation

**Caller passes:**
```
Take screenshots of https://keylistings.com/customers/duwest and save to site-testing/keylistings/customers/duwest/screenshots
```

**You do:**
1. `cd /root/code/qa-bot`
2. `npm run screenshot https://keylistings.com/customers/duwest site-testing/keylistings/customers/duwest/screenshots`
3. Create/update `site-testing/keylistings/customers/duwest/screenshots/README.md`
4. `git add -A && git commit && git push`
5. Report: "Captured 6 screenshots (13MB total) for DuWest site. View at [link]"

## Notes

- If the output directory doesn't exist, the screenshot tool will create it
- Always use the current date (YYYY-MM-DD format) in the README
- Extract the site name from the URL for commit messages and README title
- The screenshot tool is already installed and ready to use in the qa-bot repo
