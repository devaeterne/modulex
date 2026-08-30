"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay, Parallax, EffectCreative } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/effect-creative";
import Link from "next/link";
import StoreIcon from "@/components/StoreIcon";

export default function HeroPremium() {
  return (
    <section className="hero-slider premium-hero">
      <Swiper
        modules={[Navigation, Pagination, Autoplay, Parallax, EffectCreative]}
        effect="creative"
        loop={true}
        speed={1500}
        parallax={true}
        creativeEffect={{ prev: { shadow: true, translate: [0, 0, -400] }, next: { translate: ["100%", 0, 0] } }}
        autoplay={{ delay: 6000, disableOnInteraction: false }}
        pagination={{ clickable: true, el: ".hero-pagination" }}
        navigation={{ nextEl: ".hero-swiper-next", prevEl: ".hero-swiper-prev" }}
        className="premium-swiper"
      >
        <SwiperSlide>
          <div className="hero-slide" style={{ backgroundImage: "url('/assets/images/img(8).jpg')" }} data-swiper-parallax-scale="1.1">
            <div className="hero-overlay"></div>
            <div className="container"><div className="hero-content"><h1 data-swiper-parallax="-300">Curated<br /><span className="highlight">Luxury Living</span></h1><p data-swiper-parallax="-200">Experience the pinnacle of sophisticated interior architecture.</p><div className="hero-cta" data-swiper-parallax="-100"><Link href="#contact" className="btn-primary">Start Your Project</Link><Link href="#portfolio" className="btn-secondary">View Portfolio</Link></div></div></div>
          </div>
        </SwiperSlide>
        <SwiperSlide>
          <div className="hero-slide" style={{ backgroundImage: "url('/assets/images/img(2).jpg')" }} data-swiper-parallax-scale="1.1">
            <div className="hero-overlay"></div>
            <div className="container"><div className="hero-content"><h1 data-swiper-parallax="-300">Bespoke<br /><span className="highlight">Sanctuaries</span></h1><p data-swiper-parallax="-200">Personalized spaces designed for serenity and style.</p><div className="hero-cta" data-swiper-parallax="-100"><Link href="#services" className="btn-primary">Our Services</Link></div></div></div>
          </div>
        </SwiperSlide>
        <SwiperSlide>
          <div className="hero-slide" style={{ backgroundImage: "url('/assets/images/img(11).jpg')" }} data-swiper-parallax-scale="1.1">
            <div className="hero-overlay"></div>
            <div className="container"><div className="hero-content"><h1 data-swiper-parallax="-300">Timeless<br /><span className="highlight">Elegance</span></h1><p data-swiper-parallax="-200">Crafting environments that inspire for generations.</p><div className="hero-cta" data-swiper-parallax="-100"><Link href="#virtual-tour" className="btn-primary">Explore Tour</Link></div></div></div>
          </div>
        </SwiperSlide>
        <div className="hero-swiper-prev"><StoreIcon name="chevron-left" /></div>
        <div className="hero-swiper-next"><StoreIcon name="chevron-right" /></div>
        <div className="hero-pagination swiper-pagination"></div>
      </Swiper>
    </section>
  );
}
