# Prototyping Guide

## TL;DR

This introduction to prototyping answers some commonly asked questions and provides guidelines on how to effectively create a prototype.

### Related

See also the presentation _UX Prototyping for StoryMaps_ which goes into more detail about the UX reasons for prototyping (vs. the technical reasons for doing so):

- [slides](https://esriis.sharepoint.com/:p:/r/teams/StoryMapsDev-Dev/Shared%20Documents/Dev/Presentations/ux-prototyping/prototyping-ftw-story-maps-team.pptx?d=w5768d63589c440cb8d29e0534a4d850b&csf=1&web=1&e=yfdmLr)
- [video recording](https://esriis.sharepoint.com/:v:/r/teams/StoryMapsDev-Dev/Shared%20Documents/Dev/Presentations/ux-prototyping/StoryMaps_%20Prototyping-20221012_100335-Meeting%20Recording.mp4?csf=1&web=1&e=GbyUUX)

## What is a prototype?

The definition of the word "prototype" (in English anyway) is:

> **Noun:** A first, typical or preliminary model of something, especially a machine, from which other forms are developed or copied.  
> **Verb**: Make a prototype of (a product): Mercedes is prototyping a car sunroof which changes from clear to tinted.

In the context of software development, one way of thinking about prototyping could be as an exploration into a problem space that is done prior to implementation in order to gain a more robust understanding of the problem at hand, to clarify feature requirements, evaluate feasibility, and/or gain stakeholder alignment on what is being proposed.

## Why prototype?

Among other reasons, prototyping allows you to:

- Give design feedback early in the design process and collaborate more closely with UI & UX designers.
- Clarify feature requirements and reduce ambiguity prior to writing production code.
- Determine if what is being proposed is feasible, and/or the level of risk associated with it.
- Avoid figuring things out during code reviews which can be time consuming and difficult.
- Ensure that we're "building the _right thing_" (focus on UX and feature requirements), not just "building the _thing right_" (technical only focus). By making sure we're delivering a good user experience, we save time and money from having to rework things later in our production code when we discover usability problems after launching a feature.
- Assist with user testing and UX research prior to the start of implementing a new feature (relates to the above bullet point / "build the right thing").
- Have a fun break from working in and writing complicated production code, encouraging creativity :)

Generally speaking, the goals for allocating time for prototyping work are to reduce risk and uncertainty; get people on the same page about what is being built; to save time and headache later when working in production code. All of these goals have a positive impact on the business by saving time and money in the long run.

## What prototypes should focus on

When prototyping it is imperative to narrow the scope of what is being prototyped and understand why a prototype is needed. This helps keep the problem space focused while preventing the prototype from becoming too close to the real implementation. One way to think about this is by making concessions, or deciding what an individual prototype _will not_ be focusing on (e.g. design polish) in order to more efficiently research a specific problem or concept and to help the team make a more informed decision about a feature.

The following are some common types of prototyping strategies found in the wild:

### _To solve or better understand a technical problem_

Prototyping can be useful for isolating and solving problems from their larger context. This could be solving a complicated, dynamic, and fluid layout using CSS or perhaps a complex interaction pattern using JavaScript. It might be a React specific problem that is easier to solve in isolation or to debug outside of the production code. In this case the goal is purely technical, and other aspects such as design polish aren't the concern or focus of prototyping.

### _To understand what level of fidelity is achievable from a visual design concept proposed by Design_

UI designers often want to delight users with aesthetically pleasing visual designs and animations. While modern design tools allow for creating pixel perfect mocks, it isn't always clear how close development can get to such mocks due to how browsers and devices work in concert. Prototyping enables us to explore what is feasible and the risks associated with pushing the envelope when it comes to UI and UX design in a low-risk way.

### _Integration with live / real world data_

Data driven UI and designs (especially charts and maps) that are dependent on user provided data aren't always predictable and often can only be evaluated through testing with real data. UI designers don't always consider edge cases that commonly crop up in data driven products, such as empty states, error states, or outliers in the data. Creating a prototype with real-world data allows you to tease out these missing design requirements early on in the development process.

Tip: If real data isn't available yet for what you're prototyping, then consider using data that is similar to the data you expect to be using, rather than using mock data. For example, when creating a timeline visualization or UI that is dependent on temporal data but without access to the real data, using public data from [New York City's 311 service](https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9) can mimic or get "close enough" to what the anticipated data might be. 311 data is temporal (has start and end timestamps), categorical (type of service request such as noise complaint, abandoned vehicle, etc.), location based (latitude longitude coordinates), status (opened vs. closed), etc. that lends itself to being useful for designing temporal visualizations. Again, if at all possible avoid using mock data here, e.g. data that has been programmatically generated. Real world data is messy and has unexpected characteristics and flaws which mock data cannot easily capture. Prototyping with messy data helps expose potential pitfalls or unconsidered use cases for a feature which leads to a more robust and resilient UI and UX design.

### _Interaction / User Flow_

Does a proposed interaction pattern make sense? Sometimes the only way to tell is to build a working demo, and ideally user-test it. This can often be accomplished by creating "click through" prototypes in design software such as Figma, but for some interaction patterns a prototype created using HTML, CSS, and JS is better suited to mimicking the intended user flow or interaction. One example of this is features that use interactive maps, which design software cannot accurately mimic in a click through prototype.

### _Accessibility_

A prototype that focuses on accessibility (A11Y) can help figure out attributes that design tooling often cannot such as:

- What the semantic HTML of a UI component or page layout should be
- What ARIA attributes, roles, and states should be used (if any: remember the first rule of ARIA is don't use ARIA!)
- Keyboard navigation using the tab, arrow, space, enter, escape keys
- Focus management to figure out tab order and "visual focus" for compound UI components (e.g. radio button groups, checkbox groups, ComboBox, etc.)

When building an A11Y focused prototype you also have the ability to manually test it using your keyboard and/or screen reader software (such as VoiceOver or NVDA) to get a better sense of whether the design being proposed is accessible or not. Remember that "accessible" does not necessarily equate to being "usable". A11Y prototyping can help ensure that a design also has good usability in its accessibility requirements, and provide feedback to design if it does not.

### _Motion and Animation_

When animating things on the web we often rely on CSS, but for complex animations this isn't always possible, in which case we must use JavaScript. One example of this could be updating a chart or visualization with new or filtered data, and animating the changes in the size, position, and shape of its marks (this is a common and useful use case for animation in data visualization). Once we implement such an animation how do we know if it will actually be appropriate for the given context it will be used in? Creating a prototype that focuses on animation and/or motion can give the team more information to make a decision on whether it makes sense to use or not; or even be user tested as part of UX research. As web developers and programmers we also have the ability to refine and tweak animation and motion, which can be helpful for informing design prior to implementation.

### _The "Kitchen Sink"_

**_Warning! Avoid this one if at all possible!_**

The so-called "kitchen sink" prototype attempts to include many or most of the strategies above. The danger is that it can become too complex and time consuming to maintain. It's also a sign that the goal of the prototype isn't scoped well and is too broad. Generally speaking, individual prototypes should seek to evaluate one or two problems or concepts, not a handful. There are appropriate times for using the kitchen sink prototyping strategy, but keep in mind that they are rare.

## Prototyping outside vs. inside the StoryMaps app

Most of the time prototyping happens outside of our production code, because:

1. **Writing prototype code (externally from production) is cheap and fast**. When writing code outside of the StoryMaps app (say in a Codepen or other environment) one can very quickly explore a concept and then abandon it if it proves to be untenable. For this reason prototype code is often considered throwaway code, meaning that it will be refactored if ported to production code or abandoned if it ends up being unhelpful or leading to a dead end. When writing code in the StoryMaps app, we generally want to avoid writing code that might be considered throwaway code and avoid writing code that may need to be abandoned not far into the future. Prototypes are often thought of as design artifacts, so in this regard it makes sense to isolate, preserve, and document them as part of the design process and research.

2. **Writing production code is expensive and time consuming to change**. It takes much more time and energy to write code as well as rework or undo things in a production environment than it does to write code in an environment without all of the checks and safeguards that benefit a production codebase. When prototyping we typically do not need to have linting, code formatting, type safety, unit tests, circular dependency checks, CI builds, version control, git hooks, code reviews, etc. Combined, all of these things tend to slow down the process of writing and deploying code, which is okay for collaborative team development work because the benefits of having clean and robust code outweigh the drawbacks of writing code more slowly. Unencumbered by these checks and balances, prototype code can be written much more quickly. This often saves time when writing production code later as it becomes more clear what code is needed and what is not, or at least gives more clarity the path forward when implementing a feature in production.

That being said, if you are comfortable and confident prototyping within our production code then by all means go ahead! One simplified way of doing this is using StoryBook and writing code that only runs as StoryBook stories. StoryBook stories run their code in isolation, which can be useful when focusing on writing a reusable UI component for example. Just keep in mind it will be more difficult to preserve your prototype as our production codebase is constantly changing (e.g. upgrading dependencies).

It's worth noting that the problem in need of prototyping may at times require working within the production code because it relies too heavily on something within our production codebase, such as Gemini. If you're unsure whether you should prototype within or outside of the production code, ask your fellow devs and lead for their thoughts and guidance.

## What tooling should I use?

The tooling you choose for prototyping will typically depend on the type of prototype you are creating, its purpose, and how comfortable you are with refactoring and porting code from one environment to another (if necessary). For quick, technical focused prototypes, tools such as Codepen and Codesandbox tend to work well. For more complex or UI focused prototypes it can be beneficial to write code locally on your machine and then deploy it to a 3rd party service such as Netlify to share it with your team. One thing to keep in mind is that if your prototype is focused on more of the UX or UI design side of things, then you don't necessarily need to stick with a similar tech stack as our production codebase (React and TypeScript); you can theoretically use any frontend tooling you like, as long as you're comfortable refactoring and porting any prototype code you might want to use later to the production codebase.

Common prototyping tooling:

- HTML, CSS, SVG, & vanilla JavaScript
- StoryBook
- Codepen.io
- Codesandbox.io
- ObservableHQ.com
- Create React App
- Vite + Svelte
- Netlify (or similar services for hosting)

---

[StoryMaps Documentation (Home)](../../README.md)
