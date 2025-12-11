import 'react';

declare module 'react' {
  interface StyleHTMLAttributes<T> extends React.HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}

// JSON
declare module '*.json';
// Markdown
declare module '*.md';
// Images
declare module '*.svg';
declare module '*.png';
declare module '*.jpg';
