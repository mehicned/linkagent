=== Linkagent ===
Contributors: linkagent
Tags: internal links, seo, internal linking, link building, ai
Requires at least: 5.8
Tested up to: 6.7
Stable tag: 1.0.0
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Internal linking on autopilot. Approve AI-found internal links once, and they go live on your site with a 2 KB script.

== Description ==

Linkagent crawls your site, finds the internal links you are missing, and picks anchor text that already exists in your copy. You approve the links you want in the Linkagent dashboard. This plugin adds the tiny script that serves them on your pages.

What the script does:

* Injects approved links by wrapping text already on the page. It never rewrites or adds content.
* Skips headings, navigation, existing links, buttons, forms, and code blocks.
* Loads deferred and works while the browser is idle. About 2 KB, no layout shift.
* New posts get linked automatically on every re-crawl. Your approvals always carry over.

Linkagent is open source. The platform is AGPL-3.0 and the embed script is MIT. You can read every line of the code that runs on your site, or self-host the whole thing.

== Installation ==

1. Install and activate the plugin.
2. Create a free Linkagent account and add your site.
3. Copy the site key from the Install page in the dashboard.
4. Paste it in Settings, then Linkagent, and save.

== Frequently Asked Questions ==

= Does this change my content? =

No. Links are added by wrapping words that already exist on the page. Your content is never rewritten.

= Will it slow my site down? =

The script is about 2 KB, loads deferred, makes one small cached request, and touches the page only when the browser is idle.

= Do the links count for SEO? =

Google renders JavaScript, so injected links are seen and counted. If you prefer links in the raw HTML, Linkagent also offers a JSON export you can apply server side.

== Changelog ==

= 1.0.0 =
* First release.
