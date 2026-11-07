# Hagekam Café

Website for Hagekam Café, Balatero Port, Puerto Galera. Brand colors are sampled from the café's crest logo.

## Stack

* Vite, vanilla JavaScript, CSS (no framework)
* Three.js scene (particle sea, sunrise shader, instanced coffee beans), lazy loaded after the visitor engages
* Lenis smooth scrolling and a sticky "scroll film" strip
* Responsive AVIF and WebP images generated with sharp

## Scripts

```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # serve the build
npm run images -- <photo-folder>   # regenerate public/img from source photos
```

`<x-pic name="..." alt="..." sizes="...">` tags in `index.html` are expanded into responsive `<picture>` elements at build time (see `vite.config.js`).
