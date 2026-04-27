# Lighthouse Audit Skill

Runs Lighthouse performance audits on websites and reports the scores.

## Context

You are a forked agent with no conversation history. Your job is to run a Lighthouse audit on a website and report back the performance scores and Core Web Vitals.

## What You'll Receive

The caller will pass you a task like:
- `Run Lighthouse audit on https://example.com`
- `Check performance scores for https://keylistings.com/customers/duwest mobile`
- `Lighthouse mobile audit for https://example.com`

The argument will include:
1. The URL to audit
2. Optional: "mobile" or "desktop" (defaults to mobile)

## Your Task

1. **Navigate to the qa-bot repository**
   ```bash
   cd /root/code/qa-bot
   ```

2. **Run the Lighthouse audit**
   ```bash
   CHROME_PATH=/root/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome npm run lighthouse <url> <mobile|desktop>
   ```

   Example:
   ```bash
   CHROME_PATH=/root/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome npm run lighthouse https://keylistings.com/customers/duwest mobile
   ```

3. **Parse and report the results**
   Extract from the output:
   - **Scores**: Performance, Accessibility, Best Practices, SEO (each out of 100)
   - **Core Web Vitals**: FCP, LCP, TBT, CLS, Speed Index

4. **Provide context and recommendations**
   Based on the scores:

   **Performance:**
   - 90-100 (🟢): Excellent
   - 50-89 (🟠): Needs improvement
   - 0-49 (🔴): Poor

   **LCP (Largest Contentful Paint):**
   - Under 2.5s: Good
   - 2.5-4s: Needs improvement
   - Over 4s: Poor

   **Common issues to flag:**
   - LCP over 4s: Large images, slow server response, render-blocking resources
   - Low accessibility score: Missing alt text, color contrast, ARIA labels
   - Low SEO score: Usually due to noindex, missing meta tags, or crawl issues

5. **Report back to the main thread**
   Provide a concise summary like:

   ```
   Lighthouse Audit Results (Mobile):

   📊 Scores:
   - Performance: 🟠 54/100
   - Accessibility: 🟠 81/100
   - Best Practices: 🟢 100/100
   - SEO: 🟠 61/100

   ⚡ Core Web Vitals:
   - First Contentful Paint: 6.9s
   - Largest Contentful Paint: 19.9s ⚠️ (should be < 2.5s)
   - Total Blocking Time: 150ms
   - Cumulative Layout Shift: 0.024
   - Speed Index: 11.0s

   🚨 Key Concerns:
   - LCP of 19.9s is extremely slow (simulated 4G conditions)
   - Performance score of 54 needs significant improvement
   - SEO score of 61 likely due to noindex tag

   💡 Recommendations:
   - Optimize images and enable lazy loading
   - Reduce JavaScript bundle size
   - Consider SSR/SSG for faster initial load
   - Remove noindex tag to improve SEO score
   ```

## Technical Details

**About Lighthouse:**
- Same engine as Google PageSpeed Insights
- Runs locally using Puppeteer's Chrome
- Simulates mobile 4G throttling by default
- Desktop mode uses desktop viewport with no throttling

**Score Ranges:**
- 90-100: Green (good)
- 50-89: Orange (needs improvement)
- 0-49: Red (poor)

**Core Web Vitals Targets:**
- FCP (First Contentful Paint): < 1.8s
- LCP (Largest Contentful Paint): < 2.5s
- TBT (Total Blocking Time): < 200ms
- CLS (Cumulative Layout Shift): < 0.1
- Speed Index: < 3.4s

## Example Invocation

**Caller passes:**
```
Run Lighthouse audit on https://keylistings.com/customers/duwest mobile
```

**You do:**
1. `cd /root/code/qa-bot`
2. Run Lighthouse with mobile strategy
3. Parse output
4. Report formatted summary with context and recommendations

## Notes

- Always use the CHROME_PATH environment variable pointing to Puppeteer's Chrome
- Mobile audits simulate 4G throttling, so scores will be lower than desktop
- The audit takes 30-60 seconds to complete
- If the audit fails, report the error and suggest checking if the URL is accessible
- Don't commit anything - just run the audit and report results
