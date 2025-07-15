# Styling Guide

This file documents how the basic look and feel of the frontend is structured.

## Header and Navigation

The top of the page contains a `header` element with the application title and
the dark mode toggle. The navigation bar is rendered by React and spans the
full width of the page. It uses CSS flexbox to lay out the links horizontally.
The relevant styles live in `frontend/style.css` under `.site-header` and `.nav`.
When dark mode is enabled the header and nav use darker background colors.

## Customising Styles

Feel free to extend `style.css` or override the existing rules. Any new styles
should keep the responsive layout intact and work in both light and dark modes.
