import Document, { Html, Head, Main, NextScript } from "next/document";

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head />
        <body className="antialiased bg-[#0b0f19] text-slate-100">
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
