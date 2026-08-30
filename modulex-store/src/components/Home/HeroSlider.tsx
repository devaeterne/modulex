"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay, EffectFade } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/effect-fade";
import Link from "next/link";
import StoreIcon from "@/components/StoreIcon";

export default function HeroSlider() {
  return (
    <section className="hero-slider">
      <Swiper
        modules={[Navigation, Pagination, Autoplay, EffectFade]}
        effect="fade"
        loop={true}
        speed={1000}
        autoplay={{
          delay: 5000,
          disableOnInteraction: false,
        }}
        pagination={{
          clickable: true,
          el: ".hero-pagination",
        }}
        navigation={{
          nextEl: ".hero-swiper-next",
          prevEl: ".hero-swiper-prev",
        }}
        className="hero-swiper"
      >
        {/* Slide 1 */}
        <SwiperSlide>
          <div
            className="hero-slide"
            style={{ backgroundImage: "url('/assets/images/img(1).jpg')" }}
          >
            <div className="hero-overlay"></div>
            <div className="container">
              <div className="hero-content">
                <h1>
                  Thoughtful<br />
                  <span className="highlight">Interior Design</span>
                </h1>
                <p>
                  Creating elegant living spaces that balance beauty, comfort, and
                  function.
                </p>
                <div className="hero-cta">
                  <Link href="#contact" className="btn-primary">
                    Start Your Project
                  </Link>
                  <Link href="#portfolio" className="btn-secondary">
                    View Portfolio
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </SwiperSlide>

        {/* Slide 2 */}
        <SwiperSlide>
          <div
            className="hero-slide"
            style={{ backgroundImage: "url('/assets/images/img(4).jpg')" }}
          >
            <div className="hero-overlay"></div>
            <div className="container">
              <div className="hero-content">
                <h1>
                  Designed for<br />
                  <span className="highlight">Modern Living</span>
                </h1>
                <p>
                  Spaces crafted to elevate everyday life with timeless
                  aesthetics.
                </p>
                <div className="hero-cta">
                  <Link href="#services" className="btn-primary">
                    Our Services
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </SwiperSlide>

        {/* Slide 3 */}
        <SwiperSlide>
          <div
            className="hero-slide"
            style={{ backgroundImage: "url('/assets/images/img(9).jpg')" }}
          >
            <div className="hero-overlay"></div>
            <div className="container">
              <div className="hero-content">
                <h1>
                  Experience<br />
                  <span className="highlight">360° Design</span>
                </h1>
                <p>
                  Explore immersive interiors through our interactive virtual
                  tours.
                </p>
                <div className="hero-cta">
                  <Link href="#virtual-tour" className="btn-primary">
                    Explore Tour
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </SwiperSlide>

        {/* Navigation */}
        <div className="hero-swiper-prev">
          <StoreIcon name="chevron-left" />
        </div>
        <div className="hero-swiper-next">
          <StoreIcon name="chevron-right" />
        </div>

        {/* Pagination */}
        <div className="hero-pagination swiper-pagination"></div>
      </Swiper>
    </section>
  );
}
