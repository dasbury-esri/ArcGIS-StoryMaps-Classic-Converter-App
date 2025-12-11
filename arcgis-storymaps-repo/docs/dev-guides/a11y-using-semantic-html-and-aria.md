# Using semantic HTML and ARIA

## TL,DR;

This is a guide for Developers, Product Engineers, and others on how to best structure HTML and use [ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA) to improve the accessibility in the StoryMaps apps. This guide is not exhaustive and there are many more resources on the web, some of which this guide links to.

## Table of Contents

- [Heading Levels](#heading-levels)
- [Writing Semantic HTML](#writing-semantic-html)
- [Using ARIA](#using-aria)

## Heading Levels

These guidelines are important to ensure the best UX for users of assistive tech (AT) and for improving SEO (e.g. for published stories and the SMX website).

When using [section heading levels](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements#labeling_section_content) (`<h1>` – `<h6>`) keep in mind the following:

1. **Heading levels should NOT be used decoratively to size text** because they have underlying semantic meanings that are useful for people who use assistive technology like screen readers. If you need to have text a certain size, use CSS to adjust the `font-size` property, not a heading level. This also helps us adhere to our design system.

2. **Heading levels should be rendered sequentially within a single HTML page or context (e.g. modal).** This means an h2 should only follow an h1, an h3 should only follow an h2, etc. Users of assistive technology like screen readers use heading levels to get an outline of the document's structure, sort of like a table of contents. If a component requires the use of a heading level element, you may want to consider using a prop that can dynamically change the heading level it uses depending on the context of where its rendered in the app.

3. **There should only be one `h1` tag per page or context.** Using more than one h1 in a page will give users of AT a broken and confusing UX.

4. **DO use heading levels when appropriate!** They help provide structure to a document and are useful to users of AT to locate various parts of the page / UI (e.g. when navigating by heading levels using a screen reader's [rotor feature](https://support.apple.com/guide/voiceover/with-the-voiceover-rotor-mchlp2719/mac)). Consider adding a heading level to help a user of AT discover an important part of the DOM, such as a widget or navigation. 
In certain cases it can be beneficial to connect the heading level to another DOM element using [`aria-labelledby`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-labelledby). In the following example, the `<nav>` element recieves a descriptive label by it's neighboring heading level element:

```html
  <header>
    <h2 id="nav-title">Some useful pages on this site</h2>
    <nav aria-labelledby="nav-title">
      <!-- more markup here -->
    </nav>
  </header>
```

## Writing Semantic HTML

Using semantics when writing code is important for multiple reasons, and with HTML it's no different. The benefits of writing semantic HTML include improving the accessibility and SEO of a website. 

Here's an example of semantic HTML:

```html
<header></header>
<section>
  <article>
    <figure>
      <img>
      <figcaption></figcaption>
    </figure>
  </article>
</section>
<footer></footer>
```

And here's markup that describes a similar structure without the semantic HTML:

```html
<div id="header"></div>
<div class="section">
  <div class="article">
    <div class="figure">
      <img>
      <div class="figcaption"></div>
    </div>
  </div>
</div>
<div id="footer"></div>
```
(credit: [Free Code Camp](https://www.freecodecamp.org/news/semantic-html5-elements/))

Even just by looking at the two code examples you can immediately tell that the first is easier to understand then the "div soup" that follows. 

Users of assistive technology like screen readers benefit from the semantic markup, as they often will navigate to various parts of a page or app by searching for HTML blocks such as `<nav>`, `<a>`, `<h1>` – `<h6>`, etc. The semantic markup provides information to the User Agent's [Accessibility Tree](https://developer.chrome.com/blog/full-accessibility-tree/#what-is-the-accessibility-tree), which is what assistive tech like screen readers use to help users with visual, motor, or other types of impairments interact with content on the web. When navigating to a `<nav>` element for example, the Accessibility Tree will inform the user's assistive tech that they are in a "navigation" part of the page. This type of information helps convey what the user can expect to find and do, where.

Keep in mind that semantic HTML should not be chosen for its default styling either, for example choosing a section heading level element (`<h1>` – `<h6>`) to size text. [MDN puts it nicely](https://developer.mozilla.org/en-US/docs/Glossary/Semantics#semantics_in_html):

> HTML should be coded to represent the data that will be populated and not based on its default presentation styling. Presentation (how it should look), is the sole responsibility of CSS.

There are many semantic HTML elements, not just the newer ones introduced in HTML5 ([MDN has a good reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element)). One lesser known element is the [`<dl>` or Description List](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dl) element, which can be pretty useful for organizing information in the form of `name` : `value` pairs. See the article [On the dl](https://benmyers.dev/blog/on-the-dl/) for a good explanation. A more practical example is to use lists when there is a need for ordered or unordered collections of "things," which narrates the number of items to AT. For example, having a group of buttons where each `<button>` is wrapped in a list item like `<li role="presentation"><button></li>`, all of which are wrapped in an `<ul>`, will inform the user of the number of buttons in that part of the DOM, as well as the index of the button they are currently interacting with. 

## Using ARIA

The first rule you should know about ARIA is that **"no ARIA is better than bad ARIA"**. In other words, if you mess up ARIA, you can actually create a degraded experience for users of assistive tech like screen readers! So make sure you understand what the ARIA attribute(s) you are using (or thinking of using) are intended to be used for, prior to using them. 

Typically, if there's a semantic HTML element that accomplishes what you're looking to do with ARIA, you should reach for that if possible. For example, use the `<nav>` element rather than assign `role="navigation"` on a `<div>` element.

### What is ARIA for?

From [MDN's ARIA article](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA):

> Accessible Rich Internet Applications (ARIA) is a set of roles and attributes that define ways to make web content and web applications (especially those developed with JavaScript) more accessible to people with disabilities.

> It supplements HTML so that interactions and widgets commonly used in applications can be passed to assistive technologies when there is not otherwise a mechanism. For example, ARIA enables accessible JavaScript widgets, form hints and error messages, live content updates, and more.

ARIA can be divided into two categories: **roles** and **attributes**. Together these make web content, especially the highly dynamic kind that's created using JavaScript, more accessible to users with disabilities.

Semantic HTML elements (`nav`, `header`, `footer`, etc.) have implicit roles, so don't need them to be added. For example, a `<input type="radio">` element has an implicit `role="radio"`, so you don't need to add a role to it. The non-semantic HTML elements such as `<div>` and `<span>` have no implicit role, so applying the `role` attribute to them helps provide semantics to assistive tech when applicable. This is typically done when building complex or customized UI widgets that are not part of the standard HTML spec (for example an [image carousel](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/)).

Note that it is simpler and less error prone to use a semantic HTML element than to apply ARIA to non-semantic markup, so reach for semantic HTML when possible. The "hello world" example of this is applying a click event handler to something non-clickable like a `<span>` element and then styling the element to look like a button. In order to make such a "button" accessible, not only would you need to add the click event handler, but you would also need to add:

- a `keydown` event handler for handling the space and enter keys
- the HTML attribute `tabIndex="0"`
- the HTML attribute `role="button"`
- CSS for focus and active states

By simply using the native `<button>` element we get these features for free, avoid extra dev work, and bypass the potential for making mistakes that could degrade the accessibility of the button.

When used correctly, ARIA attributes such as `aria-label` can provide helpful information to assistive tech. For example, in the case of an icon button which has no descriptive text associated with it, applying `aria-label="edit"` would inform someone using a screen reader that they are on a button called "edit". Without that `aria-label` attribute, when the user navigates to the icon button it would just be announced as "button", with no helpful context. For a button that is meant to convey a toggle state, the `aria-pressed="true"` would inform the user that the button is a toggle and has been toggled. If the button were to open a pop-up menu, then having `aria-haspopup="true"` would inform the user that's what the button's function is. Having both `aria-pressed="true"` and `aria-haspopup="true"` would inform the user that the button opens a pop-up and that the pop-up is currently open.

**Credits:**
- https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles
- https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes

###  What doesn't ARIA do?

What ARIA won't do is implement interaction patterns for you, for example focus management. Think about what should happen when a user opens a modal or pop-up menu using the keyboard. Focus should move from the button that triggered the open action to inside the modal or menu. When the modal or menu is closed, focus should move back to the button that opened it (in the case of a modal) or to the next focusable element in the document's tab order (in the case of a pop-up menu). These types of interaction patterns have to be implemented with JavaScript; ARIA is only a contract that tells the user what to expect. It's up to us to fullfill that contract by implementing accessible interaction patterns like focus management or keyboard arrow key navigation.

### Where do I go to find examples or patterns for using ARIA?

To find information on ARIA you generally should do one (or both) of two things:

1. Search for specific ARIA attributes ([MDN is a great resource](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)).

2. Search for documented patterns that implement ARIA (as well as JavaScript) for UI widgets like Tabs, ComboBoxes, Bread Crumbs, Menus, etc. 

For number two, we highly recommend visiting the [W3C's ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/), where you'll find an abundance of examples which describe the expected behavior for things like keyboard arrow key navigation for various widgets, as well as example code (HTML, CSS, and JavaScript) for each pattern. Another great resource is Heydon Pickering's [Inclusive Components](https://inclusive-components.design/).

### How do I know if a specific ARIA attribute, state, or role is okay to use on a specific HTML element?

Look for the HTML element in question in [this table on ARIA conformance requirements](https://www.w3.org/TR/html-aria/#docconformance). If the ARIA in question is NOT listed in the third column it should NOT be used. If the HTML element in question has the same ARIA listed in the second column then you do NOT need to add it because the element already has it _implicitly_ (for example, adding the `role="button"` to a `<button>` element would be redundant because it has that role implicitly so doing this should be avoided\*).

\* **NOTE**: one exception to this rule is when removing styling (e.g. the bullets or numbers) from list items (`<li>`). In this case it is a good idea to add the `role="list"` to the parent element (an `<ul>` or `<ol>`) because Safari will remove the semantics (the `role="list"`) part from the list in such a scenario. You do NOT need to worry about this if the list is a descendant of a `<nav>` element.

### But I still have questions!

If you're still not sure about what to do, please ask for help from devs on the team who are more familiar with ARIA such as Alison, Aleksandr, and Chris.

---
[StoryMaps Documentation (Home)](../../README.md)
