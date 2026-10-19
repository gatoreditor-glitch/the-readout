export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/admin");

  // Minimal date filter (Eleventy 3 removed the built-in one)
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  eleventyConfig.addFilter("date", (value, format = "MMMM d, yyyy") => {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return String(value);
    let out = dateFmt.format(d);
    if (format.includes("'at'")) out += " at " + timeFmt.format(d);
    return out;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
  };
}
