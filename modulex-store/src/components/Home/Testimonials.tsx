"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Navigation, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import StoreIcon from "@/components/StoreIcon";

function Stars() {
  return <div className="stars">{Array.from({ length: 5 }, (_, index) => <StoreIcon name="star" key={index} />)}</div>;
}

export default function Testimonials() {
  return (
    <section className="testimonials" id="testimonials" aria-label="testimonials">
      <div className="container">
        <div className="section-header text-center">
          <span className="section-tag">Testimonials</span>
          <h2>What Our Clients Say</h2>
          <p>Real stories from satisfied homeowners who trusted us with their spaces</p>
        </div>
        <div className="testimonials-container position-relative">
          <Swiper
            modules={[Autoplay, Navigation, Pagination]}
            spaceBetween={32}
            slidesPerView={1}
            loop={true}
            autoplay={{ delay: 4000, disableOnInteraction: false, pauseOnMouseEnter: true }}
            navigation={{ nextEl: ".swiper-next", prevEl: ".swiper-prev" }}
            breakpoints={{ 768: { slidesPerView: 2 }, 992: { slidesPerView: 3 } }}
            className="testimonials-grid"
          >
            <SwiperSlide>
              <div className="testimonial-card">
                <Stars />
                <p className="testimonial-text">&quot;Oakwell transformed our apartment beyond our wildest dreams. The attention to detail and creative solutions they brought to our small space made it feel luxurious and functional. Absolutely worth every penny!&quot;</p>
                <div className="client-info"><img src="/assets/images/avatar2.jpg" alt="Sarah Johnson" /><div><h3>Sarah Johnson</h3><p>Homeowner, Manhattan</p></div></div>
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="testimonial-card featured">
                <Stars />
                <p className="testimonial-text">&quot;Working with Oakwell was an incredible experience. They listened to our needs, respected our budget, and delivered a stunning office space that our employees absolutely love. The productivity increase has been remarkable!&quot;</p>
                <div className="client-info"><img src="/assets/images/avatar3.jpg" alt="Michael Chen" /><div><h3>Michael Chen</h3><p>CEO, Tech Startup</p></div></div>
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="testimonial-card">
                <Stars />
                <p className="testimonial-text">&quot;From the first consultation to the final reveal, the team was professional, creative, and communicative. They turned our outdated house into a modern masterpiece while keeping its original charm intact.&quot;</p>
                <div className="client-info"><img src="/assets/images/avatar1.jpg" alt="Emily Rodriguez" /><div><h3>Emily Rodriguez</h3><p>Homeowner, Brooklyn</p></div></div>
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="testimonial-card">
                <Stars />
                <p className="testimonial-text">&quot;The renovation of our restaurant was completed on time and exceeded expectations. Oakwell created an ambiance that perfectly reflects our brand. Our customers notice and love the new space!&quot;</p>
                <div className="client-info"><img src="/assets/images/avatar4.jpg" alt="James Wilson" /><div><h3>James Wilson</h3><p>Restaurant Owner</p></div></div>
              </div>
            </SwiperSlide>
          </Swiper>
          <div className="swiper-prev"><StoreIcon name="chevron-left" /></div>
          <div className="swiper-next"><StoreIcon name="chevron-right" /></div>
        </div>
      </div>
    </section>
  );
}
