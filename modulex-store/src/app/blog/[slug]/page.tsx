import Link from "next/link";

export async function generateStaticParams() {
  return [
    { slug: 'embracing-minimalism' },
    { slug: 'detail' }
  ];
}

export default function BlogDetail() {
  return (
    <>
      {/* Page Header */}
      <section className="page-header">
        <div
          className="header-bg-image"
          style={{ backgroundImage: "url('/assets/images/img(2).jpg')" }}
        ></div>
        <div className="header-overlay"></div>
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title">
                <h2>Single Blog</h2>
              </div>
              <nav className="breadcrumb" data-scroll data-scroll-speed="0.5">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Single Blog</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* Blog Detail */}
      <section className="blog-detail-section">
        <div className="container">
          <div className="row">
            {/* Main Content */}
            <div className="col-lg-8">
              {/* Meta Info */}
              <div className="blog-detail-meta mb-3">
                <span className="blog-category-badge">Design Trends</span>
                <span className="blog-date">
                  <i className="bi bi-calendar3"></i> January 15, 2026
                </span>
                <span className="blog-reading-time">
                  <i className="bi bi-clock"></i> 8 min read
                </span>
              </div>

              {/* Title */}
              <h1 className="blog-detail-title">
                Embracing Minimalism: Less is More in Modern Interior Design
              </h1>

              {/* Author Info */}
              <div className="blog-author-inline mb-4">
                <img
                  src="/assets/images/avatar2.jpg"
                  alt="Sarah Mitchell"
                  className="author-avatar"
                />
                <div className="author-details">
                  <div className="author-name">Sarah Mitchell</div>
                  <div className="author-role">Senior Interior Designer</div>
                </div>
              </div>

              {/* Featured Image */}
              <div className="blog-detail-thumb">
                <img
                  src="/assets/images/img(6).jpg"
                  className="img-fluid"
                  alt="Minimalist Interior Design"
                />
              </div>

              {/* Content */}
              <div className="blog-content">
                <p className="lead-text">
                  In an increasingly cluttered world, minimalist interior design
                  offers a breath of fresh air. As we move through 2026, this
                  timeless aesthetic continues to evolve, proving that simplicity
                  isn't about having less—it's about making room for more of
                  what truly matters.
                </p>

                <p>
                  Minimalism has come a long way from its stark, austere
                  origins. Today's minimalist spaces embrace warmth and
                  personality while maintaining the core principles of
                  simplicity and intentionality. The key is understanding that
                  minimalism isn't about emptiness—it's about purpose.
                </p>

                <h2>The Evolution of Modern Minimalism</h2>
                <p>
                  Contemporary minimalist design focuses on creating spaces that
                  feel both calming and lived-in. This means incorporating
                  natural materials, warm textures, and thoughtful color
                  palettes that add depth without overwhelming the senses.
                </p>

                <div className="blog-image-wrapper">
                  <img
                    src="/assets/images/img(2).jpg"
                    className="img-fluid"
                    alt="Modern Minimalist Living Room"
                  />
                  <p className="image-caption">
                    A contemporary minimalist living room featuring warm wood
                    tones and natural textures
                  </p>
                </div>

                <h2>Key Principles for Minimalist Interiors</h2>

                <h3>1. Quality Over Quantity</h3>
                <p>
                  The foundation of minimalist design lies in choosing fewer,
                  better pieces. Invest in high-quality furniture and decor that
                  serves both functional and aesthetic purposes. A well-crafted
                  sofa, a thoughtfully designed coffee table, or a statement
                  lighting fixture can anchor a room without the need for
                  excessive accessories.
                </p>

                <blockquote className="blog-quote">
                  <i className="bi bi-quote quote-icon"></i>
                  <p>
                    "Perfection is achieved not when there is nothing more to
                    add, but when there is nothing left to take away."
                  </p>
                  <cite>— Antoine de Saint-Exupéry</cite>
                </blockquote>

                <h3>2. Functional Beauty</h3>
                <p>
                  Every element in a minimalist space should earn its place.
                  This doesn't mean sacrificing beauty for function—it means
                  finding pieces that excel at both. Look for furniture with
                  clean lines that also offers hidden storage, or decorative
                  objects that serve a practical purpose.
                </p>

                <div className="blog-image-grid">
                  <div className="grid-item">
                    <img
                      src="/assets/images/floating(1).jpg"
                      alt="Minimalist Bedroom"
                    />
                  </div>
                  <div className="grid-item">
                    <img
                      src="/assets/images/img(8).jpg"
                      alt="Minimalist Kitchen"
                    />
                  </div>
                </div>

                <h3>3. Neutral Color Palettes with Purpose</h3>
                <p>
                  While minimalism is often associated with white and gray, the
                  best minimalist spaces incorporate a carefully curated color
                  palette. Think warm whites, soft beiges, gentle grays, and
                  earthy tones that create a cohesive, calming environment.
                </p>

                <div className="blog-callout">
                  <div className="callout-icon">
                    <i className="bi bi-lightbulb-fill"></i>
                  </div>
                  <div className="callout-content">
                    <h4>Pro Tip: The One In, One Out Rule</h4>
                    <p>
                      Maintain your minimalist space by adopting the "one in,
                      one out" principle. When you bring something new into your
                      home, remove something old. This keeps clutter at bay and
                      ensures every item continues to earn its place.
                    </p>
                  </div>
                </div>

                <h2>Creating Warmth in Minimalist Spaces</h2>
                <p>
                  One of the biggest challenges in minimalist design is avoiding
                  a cold, sterile feel. Here are proven strategies to add
                  warmth:
                </p>

                <ul className="blog-list">
                  <li>
                    <strong>Layer Textures:</strong> Combine smooth surfaces
                    with rough textures like linen, wool, or natural wood.
                  </li>
                  <li>
                    <strong>Embrace Natural Materials:</strong> Wood, stone,
                    leather, and ceramic bring organic warmth.
                  </li>
                  <li>
                    <strong>Strategic Lighting:</strong> Use multiple light
                    sources at different levels to create ambiance.
                  </li>
                  <li>
                    <strong>Greenery:</strong> Plants add life and color without
                    cluttering the space.
                  </li>
                  <li>
                    <strong>Personal Touches:</strong> Display a few meaningful
                    items that tell your story.
                  </li>
                </ul>

                <h2>The Psychology of Minimalist Living</h2>
                <p>
                  Beyond aesthetics, minimalist design offers profound
                  psychological benefits. Research shows that cluttered
                  environments can increase stress and anxiety, while simplified
                  spaces promote mental clarity and emotional well-being.
                </p>

                {/* Video Embed */}
                <div className="blog-video ratio ratio-16x9">
                  <iframe
                    src="https://www.youtube.com/embed/Scxs7L0vhZ4"
                    title="Minimalist Interior Design Tour"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                </div>

                <h2>Making Minimalism Your Own</h2>
                <p>
                  The beauty of minimalist design is its flexibility. Whether
                  you're drawn to Japanese-inspired wabi-sabi aesthetics,
                  Scandinavian hygge comfort, or modern industrial edge,
                  minimalist principles can adapt to your personal style.
                </p>

                <p>
                  Start small—tackle one room or even one area. Evaluate each
                  item: Does it serve a purpose? Does it bring you joy? Is it
                  truly beautiful? Be honest in your answers, and don't rush the
                  process. Creating a minimalist space that feels authentic to
                  you takes time and thoughtful curation.
                </p>
              </div>

              {/* Tags */}
              <div className="blog-tags-wrapper">
                <span className="badge blog-tag">Minimalism</span>
                <span className="badge blog-tag">Interior Design</span>
                <span className="badge blog-tag">Design Trends</span>
                <span className="badge blog-tag">Home Decor</span>
              </div>

              <hr className="blog-divider" />

              {/* Author Bio */}
              <div className="author-box">
                <img
                  src="/assets/images/avatar2.jpg"
                  className="author-box-avatar"
                  alt="Sarah Mitchell"
                />
                <div className="author-box-content">
                  <h3 className="author-box-name">Sarah Mitchell</h3>
                  <p className="author-box-role">Senior Interior Designer</p>
                  <p className="author-box-bio">
                    With over 15 years of experience in residential and
                    commercial design, Sarah specializes in creating serene,
                    functional spaces that reflect her clients' unique
                    personalities. Her minimalist approach has been featured in
                    leading design publications.
                  </p>
                  <div className="author-social">
                    <Link href="#">
                      <i className="bi bi-facebook"></i>
                    </Link>
                    <Link href="#">
                      <i className="bi bi-instagram"></i>
                    </Link>
                    <Link href="#">
                      <i className="bi bi-twitter-x"></i>
                    </Link>
                    <Link href="#">
                      <i className="bi bi-linkedin"></i>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Comments Section */}
              <div className="blog-comments">
                <h3 className="comments-title">5 Comments</h3>

                <div className="comment-item">
                  <img
                    src="/assets/images/avatar-big4.jpg"
                    className="comment-avatar"
                    alt="Michael Chen"
                  />
                  <div className="comment-content">
                    <div className="comment-header">
                      <h4 className="comment-author">Michael Chen</h4>
                      <span className="comment-date">January 16, 2026</span>
                    </div>
                    <p className="comment-text">
                      This is exactly what I needed! I've been struggling to
                      make my minimalist space feel warm and inviting. The tip
                      about layering textures is gold. Thank you!
                    </p>
                    <Link href="#" className="comment-reply">
                      Reply
                    </Link>
                  </div>
                </div>

                <div className="comment-item">
                  <img
                    src="/assets/images/avatar1.jpg"
                    className="comment-avatar"
                    alt="Emily Rodriguez"
                  />
                  <div className="comment-content">
                    <div className="comment-header">
                      <h4 className="comment-author">Emily Rodriguez</h4>
                      <span className="comment-date">January 17, 2026</span>
                    </div>
                    <p className="comment-text">
                      Love the modern take on minimalism! The psychology section
                      really resonated with me. I've noticed such a difference
                      in my stress levels since decluttering my home.
                    </p>
                    <Link href="#" className="comment-reply">
                      Reply
                    </Link>
                  </div>
                </div>

                <div className="comment-item">
                  <img
                    src="/assets/images/avatar3.jpg"
                    className="comment-avatar"
                    alt="James Wilson"
                  />
                  <div className="comment-content">
                    <div className="comment-header">
                      <h4 className="comment-author">James Wilson</h4>
                      <span className="comment-date">January 18, 2026</span>
                    </div>
                    <p className="comment-text">
                      Beautiful examples! Can you recommend where to find
                      quality minimalist furniture that doesn't break the bank?
                    </p>
                    <Link href="#" className="comment-reply">
                      Reply
                    </Link>
                  </div>
                </div>
              </div>

              {/* Comment Form */}
              <div className="comment-form-wrapper">
                <h3 className="comment-form-title">Leave a Comment</h3>
                <form className="comment-form">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Your Name *"
                        required
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <input
                        type="email"
                        className="form-control"
                        placeholder="Your Email *"
                        required
                      />
                    </div>
                    <div className="col-12 mb-3">
                      <textarea
                        className="form-control"
                        rows={5}
                        placeholder="Your Comment *"
                        required
                      ></textarea>
                    </div>
                    <div className="col-12">
                      <button type="submit" className="btn btn-primary-blog">
                        Post Comment
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>

            {/* Sidebar */}
            <div className="col-lg-4">
              <div className="blog-sidebar">
                {/* Search Widget */}
                <div className="sidebar-widget">
                  <h4 className="widget-title">Search</h4>
                  <form className="sidebar-search">
                    <div className="search-wrapper">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Search articles..."
                      />
                      <button type="submit" className="search-btn">
                        <i className="bi bi-search"></i>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Categories Widget */}
                <div className="sidebar-widget">
                  <h4 className="widget-title">Categories</h4>
                  <ul className="category-list">
                    <li>
                      <Link href="#">
                        <span>Design Trends</span>
                        <span className="category-count">12</span>
                      </Link>
                    </li>
                    <li>
                      <Link href="#">
                        <span>Interior Tips</span>
                        <span className="category-count">8</span>
                      </Link>
                    </li>
                    <li>
                      <Link href="#">
                        <span>Renovation</span>
                        <span className="category-count">6</span>
                      </Link>
                    </li>
                    <li>
                      <Link href="#">
                        <span>Color Theory</span>
                        <span className="category-count">5</span>
                      </Link>
                    </li>
                    <li>
                      <Link href="#">
                        <span>Sustainability</span>
                        <span className="category-count">9</span>
                      </Link>
                    </li>
                  </ul>
                </div>

                {/* Recent Posts Widget */}
                <div className="sidebar-widget">
                  <h4 className="widget-title">Recent Posts</h4>
                  <div className="recent-posts">
                    <Link href="#" className="recent-post-item">
                      <img
                        src="/assets/images/img(9).jpg"
                        alt="Post thumbnail"
                      />
                      <div className="recent-post-content">
                        <h5>Sustainable Materials for Modern Homes</h5>
                        <span className="recent-post-date">
                          <i className="bi bi-calendar3"></i> Jan 10, 2026
                        </span>
                      </div>
                    </Link>

                    <Link href="#" className="recent-post-item">
                      <img
                        src="/assets/images/img(10).jpg"
                        alt="Post thumbnail"
                      />
                      <div className="recent-post-content">
                        <h5>The Psychology of Color in Interior Design</h5>
                        <span className="recent-post-date">
                          <i className="bi bi-calendar3"></i> Jan 5, 2026
                        </span>
                      </div>
                    </Link>

                    <Link href="#" className="recent-post-item">
                      <img
                        src="/assets/images/img(11).jpg"
                        alt="Post thumbnail"
                      />
                      <div className="recent-post-content">
                        <h5>10 Smart Solutions for Small Spaces</h5>
                        <span className="recent-post-date">
                          <i className="bi bi-calendar3"></i> Dec 28, 2025
                        </span>
                      </div>
                    </Link>
                  </div>
                </div>

                {/* Popular Posts Widget */}
                <div className="sidebar-widget">
                  <h4 className="widget-title">Popular Posts</h4>
                  <div className="popular-posts">
                    <Link href="#" className="popular-post-item">
                      <div className="popular-post-number">1</div>
                      <div className="popular-post-content">
                        <h5>Lighting Design: Setting the Perfect Ambiance</h5>
                        <div className="popular-post-meta">
                          <span>
                            <i className="bi bi-eye"></i> 3.2k
                          </span>
                        </div>
                      </div>
                    </Link>

                    <Link href="#" className="popular-post-item">
                      <div className="popular-post-number">2</div>
                      <div className="popular-post-content">
                        <h5>Luxury on a Budget: High-End Look for Less</h5>
                        <div className="popular-post-meta">
                          <span>
                            <i className="bi bi-eye"></i> 2.8k
                          </span>
                        </div>
                      </div>
                    </Link>

                    <Link href="#" className="popular-post-item">
                      <div className="popular-post-number">3</div>
                      <div className="popular-post-content">
                        <h5>Biophilic Design: Bringing Nature Indoors</h5>
                        <div className="popular-post-meta">
                          <span>
                            <i className="bi bi-eye"></i> 2.5k
                          </span>
                        </div>
                      </div>
                    </Link>
                  </div>
                </div>

                {/* Tags Widget */}
                <div className="sidebar-widget">
                  <h4 className="widget-title">Popular Tags</h4>
                  <div className="tag-cloud">
                    <Link href="#" className="tag-item">
                      Minimalism
                    </Link>
                    <Link href="#" className="tag-item">
                      Modern
                    </Link>
                    <Link href="#" className="tag-item">
                      Scandinavian
                    </Link>
                    <Link href="#" className="tag-item">
                      Eco-Friendly
                    </Link>
                    <Link href="#" className="tag-item">
                      Smart Home
                    </Link>
                    <Link href="#" className="tag-item">
                      Renovation
                    </Link>
                    <Link href="#" className="tag-item">
                      Color Palette
                    </Link>
                    <Link href="#" className="tag-item">
                      Furniture
                    </Link>
                  </div>
                </div>

                {/* Newsletter Widget */}
                <div className="sidebar-widget newsletter-widget">
                  <h4 className="widget-title">Get Design Tips</h4>
                  <form className="newsletter-form">
                    <input
                      type="email"
                      className="form-control"
                      placeholder="Your email address"
                      required
                    />
                    <button
                      type="submit"
                      className="btn btn-primary-blog w-100 mt-3"
                    >
                      Subscribe
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to Transform Your Space?</h2>
          <p>
            Let's create something extraordinary together. Schedule a free
            consultation and turn your vision into a thoughtfully designed
            reality.
          </p>
          <div className="cta-buttons">
            <Link href="/contact" className="btn-white">
              Schedule Consultation
            </Link>
            <a href="tel:+15551234567" className="btn-outline">
              Call Us Now
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
