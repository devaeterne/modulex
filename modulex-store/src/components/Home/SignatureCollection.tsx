import Link from "next/link";

export default function SignatureCollection() {
  return (
    <section className="signature-collection" aria-label="Collection">
      <div className="container">
        <div className="section-header text-center">
          <span
            className="section-tag"
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "#FF6B35",
            }}
          >
            Exclusive
          </span>
          <h2 style={{ color: "white" }}>Signature Collection</h2>
          <p style={{ color: "rgba(255,255,255,0.7)" }}>
            Handpicked premium designs for the most discerning clients.
          </p>
        </div>
        <div className="row">
          <div className="col-lg-6 mb-4">
            <div
              className="signature-item"
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: "20px",
                height: "500px",
              }}
            >
              <img
                src="/assets/images/img(1).jpg"
                alt="Signature 1"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transition: "transform 0.8s ease",
                }}
              />
              <div
                className="signature-overlay"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: "100%",
                  padding: "40px",
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.9), transparent)",
                }}
              >
                <h3
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: "2rem",
                    marginBottom: "10px",
                  }}
                >
                  The Penthouse Edit
                </h3>
                <p
                  style={{
                    color: "rgba(255,255,255,0.8)",
                    marginBottom: "20px",
                  }}
                >
                  Luxury redefined for skyline living.
                </p>
                <Link
                  href="#"
                  className="btn-link"
                  style={{
                    color: "#FF6B35",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  View Collection
                </Link>
              </div>
            </div>
          </div>
          <div className="col-lg-6 mb-4">
            <div className="row h-100">
              <div className="col-12 mb-4" style={{ height: "235px" }}>
                <div
                  className="signature-item"
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: "20px",
                    height: "100%",
                  }}
                >
                  <img
                    src="/assets/images/img(2).jpg"
                    alt="Signature 2"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <div
                    className="signature-overlay"
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      width: "100%",
                      padding: "30px",
                      background:
                        "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                    }}
                  >
                    <h4
                      style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: "1.5rem",
                      }}
                    >
                      Modern Heritage
                    </h4>
                  </div>
                </div>
              </div>
              <div className="col-12" style={{ height: "235px" }}>
                <div
                  className="signature-item"
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: "20px",
                    height: "100%",
                  }}
                >
                  <img
                    src="/assets/images/img(3).jpg"
                    alt="Signature 3"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <div
                    className="signature-overlay"
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      width: "100%",
                      padding: "30px",
                      background:
                        "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                    }}
                  >
                    <h4
                      style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: "1.5rem",
                      }}
                    >
                      Eco-Luxe
                    </h4>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
