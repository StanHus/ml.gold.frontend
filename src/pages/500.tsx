export default function FiveHundred() {
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
        <div style={{ fontSize: 48, fontWeight: 800, marginBottom: 8 }}>
          500
        </div>
        <div style={{ opacity: 0.8 }}>
          Something went wrong. Please try again later.
        </div>
      </div>
    </main>
  );
}
