export default {
  content: ["./index.html", "./src/**/*.{js,html}"],
  theme: {
    extend: {
      colors: { wine: "#902d4b", paper: "#fbfaf8", ink: "#24323b" },
      fontFamily: {
        sans: ["Lato", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
