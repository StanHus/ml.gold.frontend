import { NextPageContext } from "next";

function ErrorPage({ statusCode }: { statusCode?: number }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0f19",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, Helvetica, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, fontWeight: 800, marginBottom: 8 }}>
          {statusCode || 500}
        </div>
        <div style={{ opacity: 0.8 }}>An error occurred.</div>
      </div>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res
    ? res.statusCode
    : err && typeof (err as { statusCode?: number })?.statusCode === "number"
    ? (err as { statusCode?: number }).statusCode
    : 404;
  return { statusCode };
};

export default ErrorPage;
