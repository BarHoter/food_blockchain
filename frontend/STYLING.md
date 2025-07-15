# Styling Guide

This file documents how the basic look and feel of the frontend is structured.

## Header and Navigation

The header containing the application title, navigation links and dark mode
toggle is rendered by React. It spans the full width of the page and uses CSS
flexbox to lay out the links horizontally. All markup lives in
`frontend/main.tsx` and the relevant styles live in `frontend/style.css` under
`.site-header`, `.nav` and `.switch`.
When dark mode is enabled the header and nav use darker background colors.

## Customising Styles

Feel free to extend `style.css` or override the existing rules. Any new styles
should keep the responsive layout intact and work in both light and dark modes.
