# Search changes to colabroom.com

One row per change to the site that could move how it is found: a title, a
description, a heading, page data, a URL, the sitemaps, robots.txt or the
crawl set-up. Site changes only. This repository is public: `_config.yml`
keeps this file off the website, not off GitHub, so nothing private, no
console numbers and nothing about a person goes here. Work outside the site
(Search Console, Bing, the stores, fliers, posts) and what was observed are
kept in the owner's private log.

"Date live" is the day the merge reached the live site, in UTC; "set at
merge" means the row was written before that day was known.

| Date live (UTC) | PR | Page(s) | What changed (old -> new) | Why | Number watched | Check on |
|---|---|---|---|---|---|---|
| set at merge | SEO foundations (brief 01) | every visual page, `index.html` | no icon -> favicon.ico, favicon.svg, apple-touch-icon.png from the app's mark; home data: Organization + app -> WebSite (name, alternate spellings) + Organization (logo, email, parent company) + app (url colabroom.com, free) | Google showed a grey globe and "colabroom.com" | the icon and site name Google shows for `colabroom` | two to four weeks after merge |
| set at merge | SEO foundations (brief 02) | `sitemap.xml`, every visual page, new `_config.yml`, IndexNow | stale lastmods -> the day each page's words last changed; `index.html` links -> `/`; README.md, tools/ and repo notes no longer served; IndexNow ping after each deploy of main (hand-written pages only) | Google trusts lastmod only when it is accurate; Bing learns of changes only by crawling | how many sitemap pages Bing has indexed | two weeks after merge |
| set at merge | SEO foundations (brief 03) | `chords.html`, `what-key.html`, musician records, every visual page | HowTo -> WebApplication on two tools; musician Person -> ProfilePage with city and state split; generated share image gains size and alt; nav group titles `<h2>` -> labelled `<p class="nav-heading">` (words unchanged) | retired markup out, current formats in; headings start at the page's own h1 | structured-data errors in Search Console (expect none) | one month after merge |
