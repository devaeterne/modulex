window.addEventListener('DOMContentLoaded', function() {
  
/* ========================================
   PANORAMA DATA WITH MULTIPLE HOTSPOT TYPES
   ======================================== */
const panos = [
  {
    img: './assets/images/panorama/image1.jpg',
    badge: 'LIVING ROOM',
    title: 'Modern Living Space',
    address: 'Main Floor - Living Area',
    beds: '3',
    baths: '2',
    year: '2023',
    size: '2400',
    hotspots: [
      {
        type: 'info',
        category: 'furniture',
        pitch: -8,
        yaw: -34,
        title: 'Designer Sofa Set',
        text: 'Premium Italian leather sectional sofa with adjustable headrests and built-in USB charging ports.',
        img: './assets/images/panorama/img2.jpg',
        link: 'https://example.com/furniture',
        popupAddress: 'Living Room',
        popupPrice: '$4,500',
        popupBeds: '',
        popupBaths: '',
        popupPhone: '',
        popupEmail: ''
      },
      {
        type: 'info',
        category: 'feature',
        pitch: -52,
        yaw: 2,
        title: 'Smart Entertainment System',
        text: '85-inch 4K OLED TV with Dolby Atmos surround sound system and smart home integration.',
        img: './assets/images/panorama/img3.jpg',
        link: '',
        popupAddress: 'Entertainment Wall',
        popupPrice: 'Included',
        popupBeds: '',
        popupBaths: '',
        popupPhone: '',
        popupEmail: ''
      },
      {
        type: 'info',
        category: 'feature',
        pitch: -20,
        yaw: -45,
        title: 'Floor-to-Ceiling Windows',
        text: 'Panoramic windows with motorized blinds, offering natural light and stunning views.',
        img: './assets/images/panorama/img1.jpg',
        link: '',
        popupAddress: 'South Wall',
        popupPrice: 'Energy Efficient',
        popupBeds: '',
        popupBaths: '',
        popupPhone: '',
        popupEmail: ''
      },
      {
        type: 'nav',
        pitch: -10,
        yaw: -85,
        title: 'Kitchen',
        targetScene: 1
      },
      {
        type: 'nav',
        pitch: -10,
        yaw: 45,
        title: 'Master Bedroom',
        targetScene: 2
      }
    ]
  },
  {
    img: './assets/images/panorama/image2.jpg',
    badge: 'KITCHEN',
    title: 'Gourmet Kitchen',
    address: 'Main Floor - Culinary Space',
    beds: '3',
    baths: '2',
    year: '2023',
    size: '450',
    hotspots: [
      {
        type: 'info',
        category: 'appliance',
        pitch: -12,
        yaw: -45,
        title: 'Professional Range',
        text: 'Wolf 48-inch dual-fuel range with 8 burners, griddle, and double convection ovens.',
        img: './assets/images/panorama/img1.jpg',
        link: '',
        popupAddress: 'Cooking Station',
        popupPrice: '$15,000',
        popupBeds: '',
        popupBaths: '',
        popupPhone: '',
        popupEmail: ''
      },
      {
        type: 'info',
        category: 'feature',
        pitch: -5,
        yaw: 30,
        title: 'Waterfall Island',
        text: 'Quartz waterfall island with seating for 4, prep sink, and wine cooler.',
        img: './assets/images/panorama/img3.jpg',
        link: '',
        popupAddress: 'Center Island',
        popupPrice: 'Custom Design',
        popupBeds: '',
        popupBaths: '',
        popupPhone: '',
        popupEmail: ''
      },
      {
        type: 'info',
        category: 'storage',
        pitch: -10,
        yaw: 0,
        title: 'Custom Cabinetry',
        text: 'Floor-to-ceiling custom cabinets with soft-close drawers, pull-out organizers, and LED lighting.',
        img: './assets/images/panorama/img4.jpg',
        link: '',
        popupAddress: 'Wall Storage',
        popupPrice: 'Integrated',
        popupBeds: '',
        popupBaths: '',
        popupPhone: '',
        popupEmail: ''
      },
      {
        type: 'nav',
        pitch: 0,
        yaw: 90,
        title: 'Living Room',
        targetScene: 0
      },
      {
        type: 'nav',
        pitch: 0,
        yaw: -90,
        title: 'Dining Room',
        targetScene: 2
      }
    ]
  },
  {
    img: './assets/images/panorama/image3.jpg',
    badge: 'MASTER BEDROOM',
    title: 'Luxury Master Suite',
    address: 'Second Floor - Private Retreat',
    beds: '1 King',
    baths: '1 En-suite',
    year: '2023',
    size: '580',
    hotspots: [
      {
        type: 'info',
        category: 'furniture',
        pitch: -8,
        yaw: -60,
        title: 'Custom King Bed',
        text: 'Hand-crafted king bed with upholstered headboard, integrated nightstands, and ambient lighting.',
        img: './assets/images/panorama/img3.jpg',
        link: '',
        popupAddress: 'Sleeping Area',
        popupPrice: '$6,800',
        popupBeds: '1 King',
        popupBaths: '',
        popupPhone: '',
        popupEmail: ''
      },
      {
        type: 'info',
        category: 'feature',
        pitch: 0,
        yaw: 45,
        title: 'Walk-In Closet',
        text: 'Spacious walk-in closet with custom shelving, full-length mirrors, and jewelry drawers.',
        img: './assets/images/panorama/img1.jpg',
        link: '',
        popupAddress: 'Dressing Area',
        popupPrice: '250 sq ft',
        popupBeds: '',
        popupBaths: '',
        popupPhone: '',
        popupEmail: ''
      },
      {
        type: 'info',
        category: 'bathroom',
        pitch: -12,
        yaw: 0,
        title: 'Spa Bathroom',
        text: 'Luxury en-suite with soaking tub, rain shower, double vanity, and heated floors.',
        img: './assets/images/panorama/img2.jpg',
        link: '',
        popupAddress: 'En-suite Bath',
        popupPrice: '5-Star Amenities',
        popupBeds: '',
        popupBaths: '1 Full',
        popupPhone: '',
        popupEmail: ''
      },
      {
        type: 'nav',
        pitch: 0,
        yaw: 90,
        title: 'Hallway',
        targetScene: 1
      },
      {
        type: 'nav',
        pitch: 0,
        yaw: -90,
        title: 'Balcony',
        targetScene: 1
      }
    ]
  }
]
/* ========================================
   INITIALIZE SLIDES
   ======================================== */
const loader = document.getElementById('loader');
const slidesContainer = document.getElementById('slides');

panos.forEach((pano, i) => {
  const slide = document.createElement('div');
  slide.className = 'slide' + (i === 0 ? ' active' : '');
  const panoDiv = document.createElement('div');
  panoDiv.className = 'pano';
  panoDiv.id = 'pano-' + i;
  pano.id = panoDiv.id;
  slide.appendChild(panoDiv);
  slidesContainer.appendChild(slide);
});

let viewers = [];
let current = 0;
const slides = document.querySelectorAll('.slide');

/* ========================================
   POPUP FUNCTIONS
   ======================================== */
window.openPopup = function(data) {
  /* document.getElementById('popup-img').src = data.img || ''; */
  const popupImg = document.getElementById('popup-img');
  popupImg.classList.remove('show');
  popupImg.src = '';
  popupImg.style.opacity = '0';
  if (data.img) {
    const img = new Image();
    img.onload = () => {
      popupImg.src = data.img;
      // force repaint before fade in
      requestAnimationFrame(() => {
        popupImg.classList.add('show');
        popupImg.style.opacity = '1';
      });
    };
    img.src = data.img;
  }

  document.getElementById('popup-title').textContent = data.title || '';
  document.getElementById('popup-text').textContent = data.text || '';
  
  // Handle popup price
  const priceDiv = document.getElementById('popup-price').parentElement;
  if (data.popupPrice && data.popupPrice.toString().trim() !== '') {
    document.getElementById('popup-price').textContent = data.popupPrice;
    priceDiv.style.display = 'block';
  } else {
    priceDiv.style.display = 'none';
  }
  
  // Handle popup address
  const addressDiv = document.getElementById('popup-address').parentElement;
  if (data.popupAddress && data.popupAddress.toString().trim() !== '') {
    document.getElementById('popup-address').textContent = data.popupAddress;
    addressDiv.style.display = 'block';
  } else {
    addressDiv.style.display = 'none';
  }
  
  // Handle beds and baths
  const bedsEl = document.getElementById('popup-beds');
  const bathsEl = document.getElementById('popup-baths');
  const bedsBathsDiv = bedsEl.parentElement;
  
  const hasBeds = data.popupBeds !== undefined && data.popupBeds !== null && data.popupBeds.toString().trim() !== '';
  const hasBaths = data.popupBaths !== undefined && data.popupBaths !== null && data.popupBaths.toString().trim() !== '';
  
  if (hasBeds || hasBaths) {
    bedsEl.textContent = hasBeds ? data.popupBeds : '-';
    bathsEl.textContent = hasBaths ? data.popupBaths : '-';
    bedsBathsDiv.style.display = 'block';
  } else {
    bedsBathsDiv.style.display = 'none';
  }
  
  // Handle phone
  const phoneDiv = document.getElementById('popup-phone').parentElement;
  const phoneEl = document.getElementById('popup-phone');
  if (data.popupPhone && data.popupPhone.toString().trim() !== '') {
    phoneEl.textContent = data.popupPhone;
    phoneEl.href = 'tel:' + data.popupPhone.replace(/\s+/g, '');
    phoneDiv.style.display = 'block';
  } else {
    phoneDiv.style.display = 'none';
  }
  
  // Handle email
  const emailDiv = document.getElementById('popup-email').parentElement;
  const emailEl = document.getElementById('popup-email');
  if (data.popupEmail && data.popupEmail.toString().trim() !== '') {
    emailEl.textContent = data.popupEmail;
    emailEl.href = 'mailto:' + data.popupEmail;
    emailDiv.style.display = 'block';
  } else {
    emailDiv.style.display = 'none';
  }
  
  // Handle link
  const linkEl = document.getElementById('popup-link');
  if (data.link && data.link.toString().trim() !== '') {
    linkEl.href = data.link;
    linkEl.style.display = 'inline-block';
  } else {
    linkEl.style.display = 'none';
  }
  
  document.getElementById('popup').classList.add('active');
};

window.closePopup = function() {
  document.getElementById('popup').classList.remove('active');
};

window.navigateToPanorama = function(targetIndex) {
  if (targetIndex >= 0 && targetIndex < panos.length && targetIndex !== current) {
    showSlide(targetIndex);
  }
};

/* ========================================
   HOTSPOT TOOLTIP
   ======================================== */
function hotspotTooltip(div, text) {
  div.dataset.label = text;
  div.style.visibility = 'hidden';
}


/* ========================================
   INITIALIZE PANORAMA
   ======================================== */
function initPano(index) {
  
  const focusHotspot = panos[index].hotspots?.[0];
  const startYaw = focusHotspot ? ((focusHotspot.yaw % 360) + 540) % 360 - 180 : 0;
  const startPitch = focusHotspot ? focusHotspot.pitch : 0;
  
  try {
    viewers[index] = pannellum.viewer(panos[index].id, {
      type: 'equirectangular',
      panorama: panos[index].img,
      yaw: startYaw,
      pitch: startPitch,
      hfov: 120,
      minHfov: 100,
      maxHfov: 130,
      autoLoad: true,
      showControls: false,
      showFullscreenCtrl: false,
      compass: false,
      showCompass: false,
      mouseZoom: true,
      keyboardZoom: false,
      deviceOrientation: false,
      autoRotate: 1.2,
      autoRotateInactivityDelay: 3000,
      preserveDrawingBuffer: true,
      hotSpots: panos[index].hotspots.map(h => {
        const yaw = ((h.yaw % 360) + 540) % 360 - 180;
        if (h.type === 'nav') {
          // Navigation hotspot
          return {
            pitch: h.pitch,
            yaw: yaw,
            cssClass: "nav-hotspot",
            createTooltipFunc: hotspotTooltip,
            createTooltipArgs: h.title,
            clickHandlerFunc: () => navigateToPanorama(h.targetScene)
          };
        } else {
          // Info hotspot (default)
          return {
            pitch: h.pitch,
            yaw: yaw,
            cssClass: "custom-hotspot",
            createTooltipFunc: hotspotTooltip,
            createTooltipArgs: h.title,
            clickHandlerFunc: () => openPopup(h)
          };
        }
      })
    });
    
    bindViewerEvents(viewers[index]);
    
    if (loader) {
  viewers[index].on("load", () => {
    loader.classList.add("hide");

    document
      .querySelectorAll('.pnlm-hotspot-base')
      .forEach(div => {
        div.style.visibility = 'visible';
        if (div.dataset.label && !div.querySelector('.hotspot-label')) {
          const label = document.createElement('span');
          label.className = 'hotspot-label';
          label.textContent = div.dataset.label;
          div.appendChild(label);
        }
      });
  });

  viewers[index].on("scenechange", () => {
    loader.classList.remove("hide");
  });
}
  } catch (err) {
    console.error('Error initializing panorama:', err);
  }
}

/* ========================================
   UPDATE SCENE INFO
   ======================================== */
function updateSceneTitle(index) {
  const box = document.getElementById('pano-title');
  box.classList.add('hide');
  
  setTimeout(() => {
    const d = panos[index];
    const badge = document.getElementById('scene-badge');
    
    if (d.badge && d.badge.trim() !== '') {
      badge.textContent = d.badge;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
    
    document.getElementById('scene-title').textContent = d.title || '';
    document.getElementById('scene-address').textContent = d.address || '';
    
    // Handle beds
    const bedsSpan = document.getElementById('scene-beds').parentElement;
    if (d.beds !== undefined && d.beds !== null && d.beds.toString().trim() !== '') {
      document.getElementById('scene-beds').textContent = d.beds;
      bedsSpan.style.display = 'inline';
    } else {
      bedsSpan.style.display = 'none';
    }
    
    // Handle baths
    const bathsSpan = document.getElementById('scene-baths').parentElement;
    if (d.baths !== undefined && d.baths !== null && d.baths.toString().trim() !== '') {
      document.getElementById('scene-baths').textContent = d.baths;
      bathsSpan.style.display = 'inline';
    } else {
      bathsSpan.style.display = 'none';
    }
    
    // Handle size
    const sizeSpan = document.getElementById('scene-size').parentElement;
    if (d.size !== undefined && d.size !== null && d.size.toString().trim() !== '') {
      document.getElementById('scene-size').textContent = d.size;
      sizeSpan.style.display = 'inline';
    } else {
      sizeSpan.style.display = 'none';
    }
    
    // Handle year
    const yearSpan = document.getElementById('scene-year').parentElement;
    if (d.year !== undefined && d.year !== null && d.year.toString().trim() !== '') {
      document.getElementById('scene-year').textContent = d.year;
      yearSpan.style.display = 'inline';
    } else {
      yearSpan.style.display = 'none';
    }
    
    box.classList.remove('hide');
  }, 300);
  
}

/* ========================================
   SLIDER FUNCTIONS
   ======================================== */
function showSlide(index) {
  // Show loader when switching panoramas
  if (loader) {
    loader.classList.remove("hide");
  }
  if (viewers[current]) {
    try {
      viewers[current].destroy();
      viewers[current] = null;
    } catch (e) {
      console.warn('Viewer destroy failed', e);
    }
  }
  slides[current].classList.remove('active');
  current = (index + slides.length) % slides.length;
  slides[current].classList.add('active');
  initPano(current);
  updateSceneTitle(current);
  
  const currentNum = String(current + 1).padStart(2, '0');
  const totalNum = String(slides.length).padStart(2, '0');
  updateCounter(currentNum, totalNum);
  updateActiveThumbnail(current);
}

/* ========================================
   AUTO SLIDE (DISABLED BY DEFAULT)
   ======================================== */
let autoSlideTimer = null;
let resumeTimer = null;
const AUTO_DELAY = 6000;
const RESUME_DELAY = 5000;

function startAutoSlide() {
  stopAutoSlide();
  autoSlideTimer = setInterval(() => showSlide(current + 1), AUTO_DELAY);
}

function stopAutoSlide() {
  if (autoSlideTimer) {
    clearInterval(autoSlideTimer);
    autoSlideTimer = null;
  }
}

function scheduleResume() {
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(startAutoSlide, RESUME_DELAY);
}

function bindViewerEvents(viewer) {
  if (!viewer) return;
  viewer.on('mousedown', () => { stopAutoSlide(); });
  viewer.on('touchstart', () => { stopAutoSlide(); });
  viewer.on('zoomchange', () => { stopAutoSlide(); });
}

/* ========================================
   CONTROLS
   ======================================== */
document.querySelector('.sld.next').addEventListener('click', () => {
  stopAutoSlide();
  showSlide(current + 1);
});

document.querySelector('.sld.prev').addEventListener('click', () => {
  stopAutoSlide();
  showSlide(current - 1);
});

/* ========================================
   FULLSCREEN
   ======================================== */
const fsBtn = document.getElementById('fs-btn');
const slider = document.getElementById('pano-slider');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

function isFullscreen() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    slider.classList.contains('is-fullscreen')
  );
}

function requestFs(el) {
  if (el.requestFullscreen) {
    el.requestFullscreen();
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
  }
}

function exitFs() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

fsBtn.addEventListener('click', () => {
  if (isIOS) {
    slider.classList.toggle('is-fullscreen');
    updateFullscreenButton();
    return;
  }
  
  if (!isFullscreen()) {
    requestFs(slider);
  } else {
    exitFs();
  }
});

document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);

function updateFullscreenButton() {
  fsBtn.innerHTML = isFullscreen()
    ? '<i class="bi bi-arrows-angle-contract"></i>'
    : '<i class="bi bi-arrows-angle-expand"></i>';
}

/* ========================================
   HOTSPOT
   ======================================== */
const hotspotToggleBtn = document.getElementById('toggle-hotspots');
let hotspotsVisible = true;

hotspotToggleBtn.addEventListener('click', () => {
  hotspotsVisible = !hotspotsVisible;

  document.body.classList.toggle('hide-hotspots', !hotspotsVisible);

  hotspotToggleBtn.innerHTML = hotspotsVisible
    ? '<i class="bi bi-circle-fill"></i>'
    : '<i class="bi bi-circle"></i>';
});


/* ========================================
   CAPTURE
   ======================================== */
document.getElementById('capture-btn').addEventListener('click', capturePanorama);

function capturePanorama() {
  const viewer = viewers[current];
  if (!viewer) return;
  
  // Show loading state
  const captureBtn = document.getElementById('capture-btn');
  const originalHTML = captureBtn.innerHTML;
  captureBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
  captureBtn.disabled = true;
  
  try {
    // Create hidden container for temporary viewer
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1920px;height:1080px;';
    tempDiv.id = 'temp-capture-viewer';
    document.body.appendChild(tempDiv);
    
    // Get current view settings
    const currentYaw = viewer.getYaw();
    const currentPitch = viewer.getPitch();
    const currentHfov = viewer.getHfov();
    
    // Create temporary viewer with same view and CRITICAL preserveDrawingBuffer
    const tempViewer = pannellum.viewer(tempDiv, {
      type: 'equirectangular',
      panorama: panos[current].img,
      yaw: currentYaw,
      pitch: currentPitch,
      hfov: currentHfov,
      autoLoad: true,
      preserveDrawingBuffer: true,
      showControls: false,
      showFullscreenCtrl: false
    });
    
    // Cleanup function
    function cleanup() {
      try {
        tempViewer.destroy();
      } catch (e) {
        console.warn('Temp viewer cleanup warning:', e);
      }
      if (document.body.contains(tempDiv)) {
        document.body.removeChild(tempDiv);
      }
      captureBtn.innerHTML = originalHTML;
      captureBtn.disabled = false;
    }
    
    tempViewer.on('load', () => {
      // Extra delay to ensure WebGL render is complete
      setTimeout(() => {
        try {
          const canvas = tempViewer.getRenderer().getCanvas();
          
          if (!canvas) {
            throw new Error('Canvas not found');
          }
          
          // Use toDataURL for better compatibility
          const dataURL = canvas.toDataURL('image/png', 1.0);
          
          if (!dataURL || dataURL === 'data:,') {
            throw new Error('Failed to generate image data');
          }
          
          // Create download link
          const sceneName = panos[current].title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
          const timestamp = new Date().toISOString().slice(0, 10);
          const fileName = `${sceneName}-${timestamp}.png`;
          
          // Check if iOS
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          
          if (isIOS) {
            // iOS: Open image in new window for user to save manually
            const newWindow = window.open();
            newWindow.document.write(`
              <html>
                <head>
                  <title>${fileName}</title>
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <style>
                    body { margin: 0; padding: 20px; text-align: center; font-family: system-ui; background: #000; }
                    img { max-width: 100%; height: auto; border: 1px solid #333; }
                    p { margin: 10px 0; color: #fff; font-size: 14px; }
                  </style>
                </head>
                <body>
                  <p>Long-press the image below and select "Save Image" or "Add to Photos"</p>
                  <img src="${dataURL}" alt="${fileName}">
                </body>
              </html>
            `);
            newWindow.document.close();
            cleanup();
          } else {
            // Desktop/Android: Direct download
            const a = document.createElement('a');
            a.href = dataURL;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            cleanup();
          }
          
        } catch (error) {
          console.error('Canvas capture error:', error);
          alert('Failed to capture image: ' + error.message);
          cleanup();
        }
      }, 500);
    });
    
    // Timeout fallback
    setTimeout(() => {
      if (document.getElementById('temp-capture-viewer')) {
        alert('Capture timed out. Please try again.');
        cleanup();
      }
    }, 10000);
    
  } catch (error) {
    console.error('Capture initialization error:', error);
    alert('Failed to initialize capture: ' + error.message);
    captureBtn.innerHTML = originalHTML;
    captureBtn.disabled = false;
  }
}

/* ========================================
   COUNTER
   ======================================== */
function updateCounter(currentNum, totalNum) {
  const counter = document.getElementById('counter');
  counter.classList.remove('fade-in');
  counter.classList.add('fade-out');
  
  setTimeout(() => {
    counter.textContent = '';
    const c1 = document.createElement('span');
    c1.className = 'count-current bigft';
    c1.textContent = currentNum;
    const sep = document.createElement('span');
    sep.className = 'count-total';
    sep.textContent = ' / ';
    const c2 = document.createElement('span');
    c2.className = 'count-total';
    c2.textContent = totalNum;
    counter.append(c1, sep, c2);
    counter.classList.remove('fade-out');
    counter.classList.add('fade-in');
  }, 200);
}

/* ========================================
   AUDIO
   ======================================== */
const bgAudio = document.getElementById('bg-audio');
const soundToggleBtn = document.getElementById('sound-toggle');

let soundEnabled = false; // start muted

function playAudio() {
  if (!bgAudio) return;
  bgAudio.volume = 0.4;
  bgAudio.play().catch(() => {});
}

function stopAudio() {
  if (!bgAudio) return;
  bgAudio.pause();
  bgAudio.currentTime = 0;
}

if (bgAudio && soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;

    if (soundEnabled) {
      playAudio();
      soundToggleBtn.innerHTML = '<i class="bi bi-volume-down-fill"></i>';
    } else {
      stopAudio();
      soundToggleBtn.innerHTML = '<i class="bi bi-volume-mute"></i>';
    }
  });
}

if (bgAudio) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      bgAudio.pause();
    } else {
      if (soundEnabled) {
        bgAudio.play().catch(() => {});
      }
    }
  });
}


/* ========================================
   THUMBNAIL LIST
   ======================================== */
const thumblistBtn = document.getElementById('thumblist');
const thumblistPopup = document.getElementById('thumblist-popup');
const thumblistClose = document.getElementById('thumblist-close');
const thumblistGrid = document.getElementById('thumblist-grid');

// Generate thumbnails
function generateThumbnails() {
  thumblistGrid.innerHTML = '';
  
  panos.forEach((pano, index) => {
    const thumbItem = document.createElement('div');
    thumbItem.className = 'thumb-item' + (index === current ? ' active' : '');
    
    thumbItem.innerHTML = `
      <img src="${pano.img}" alt="${pano.title}" class="thumb-image">
      <div class="thumb-title">${pano.title}</div>
    `;
    
    thumbItem.addEventListener('click', () => {
      navigateToPanorama(index);
      closeThumblist();
    });
    
    thumblistGrid.appendChild(thumbItem);
  });
}

// Open/Close functions
function openThumblist() {
  generateThumbnails();
  thumblistPopup.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeThumblist() {
  thumblistPopup.classList.remove('active');
  document.body.style.overflow = '';
}

// Event listeners
if (thumblistBtn) {
  thumblistBtn.addEventListener('click', openThumblist);
}

if (thumblistClose) {
  thumblistClose.addEventListener('click', closeThumblist);
}

thumblistPopup.addEventListener('click', (e) => {
  if (e.target === thumblistPopup) {
    closeThumblist();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && thumblistPopup.classList.contains('active')) {
    closeThumblist();
  }
});

// Update active thumbnail
function updateActiveThumbnail(index) {
  if (thumblistPopup.classList.contains('active')) {
    document.querySelectorAll('.thumb-item').forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });
  }
}


/* ========================================
   MAIN MENU
   ======================================== */
const burger = document.getElementById('burgerMenu');
const nav = document.getElementById('MainNav');

burger.addEventListener('click', () => {
  burger.classList.toggle('open');
  nav.classList.toggle('active');
});

nav.querySelectorAll('.nav-link, .nav-dropdown a').forEach(link => {
  link.addEventListener('click', () => {
    if (link.classList.contains('dd-toggle')) {
      return;
    }
    burger.classList.remove('open');
    nav.classList.remove('active');
    nav.querySelectorAll('.nav-has-dd.open').forEach(dd => {
      dd.classList.remove('open');
    });
  });
});

document.addEventListener('click', (e) => {
  const isMenuOpen = nav.classList.contains('active');
  if (!isMenuOpen) return;
  
  const clickedInsideMenu = nav.contains(e.target);
  const clickedBurger = burger.contains(e.target);
  const clickedDdToggle = e.target.closest('.dd-toggle');
  
  if (clickedDdToggle) return;
  
  if (!clickedInsideMenu && !clickedBurger) {
    burger.classList.remove('open');
    nav.classList.remove('active');
    nav.querySelectorAll('.nav-has-dd.open').forEach(dd => {
      dd.classList.remove('open');
    });
  }
});

document.querySelectorAll('.dd-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    toggle.parentElement.classList.toggle('open');
  });
});

// Jump to panorama from menu
document.querySelectorAll('.jump-to-pano').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const index = parseInt(link.getAttribute('data-index'));
    navigateToPanorama(index);
  });
});

/* ========================================
   LIGHTBOX
   ======================================== */
const lightbox = document.getElementById('galleryLightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxPano = document.getElementById('lightboxPano');
const lightboxSection = document.getElementById('lightboxSection');
const lightboxClose = document.getElementById('lightboxClose');
const overlay = document.querySelector('.lightbox-overlay');
const lgtboxSec = document.querySelectorAll('.pop-sec');

if (lightbox && lgtboxSec.length) {
  lgtboxSec.forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.type;
      const src = item.dataset.src;
      
      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
      
      lightboxImage.style.display = 'none';
      lightboxPano.style.display = 'none';
      lightboxSection.style.display = 'none';
      
      if (type === 'image') {
        lightboxImage.style.display = 'block';
        lightboxImage.src = src;
      }
      
      if (type === 'pano') {
        lightboxPano.style.display = 'block';
        lightboxPano.src = src;
      }
      
      if (type === 'section') {
        const section = document.querySelector(src);
        if (section) {
          lightboxSection.innerHTML = section.innerHTML;
          lightboxSection.style.display = 'block';
          initDateTimePicker(lightboxSection);
          initFormSubmission(lightboxSection);
        }
      }
    });
  });
  
  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
    lightboxImage.src = '';
    lightboxPano.src = '';
    lightboxSection.innerHTML = '';
  }
  
  lightboxClose?.addEventListener('click', closeLightbox);
  overlay?.addEventListener('click', closeLightbox);
}

/* ========================================
   IMAGE POPUP
   ======================================== */
const imgPopup = document.getElementById('imgPopup');
const imgPopupImage = document.getElementById('imgPopupImage');
const imgPopupClose = document.getElementById('imgPopupClose');

if (imgPopup) {
  document.addEventListener('click', function (e) {
    const card = e.target.closest('.pop-sec');
    if (!card) return;
    if (card.dataset.type !== 'image') return;
    
    e.stopPropagation();
    e.preventDefault();
    
    imgPopup.classList.add('active');
    document.body.style.overflow = 'hidden';
    imgPopupImage.src = card.dataset.src;
  }, true);
  
  function closeImgPopup() {
    imgPopup.classList.remove('active');
    imgPopupImage.src = '';
    document.body.style.overflow = '';
  }
  
  imgPopupClose?.addEventListener('click', closeImgPopup);
  imgPopup.querySelector('.img-popup-overlay')?.addEventListener('click', closeImgPopup);
}

/* ========================================
   DATE & TIME PICKER
   ======================================== */
function initDateTimePicker(scope = document) {
  const dateInput = scope.querySelector("#visit-date");
  const datePopup = scope.querySelector("#date-popup");
  const timeInput = scope.querySelector("#visit-time");
  const timePopup = scope.querySelector("#time-popup");
  
  if (!dateInput || !datePopup || !timeInput || !timePopup) return;
  
  let currentDate = new Date();
  
  function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let html = `
      <div class="header">
        <button class="prev-month">&#8249;</button>
        <span>${date.toLocaleString("default", { month: "long" })} ${year}</span>
        <button class="next-month">&#8250;</button>
      </div>
      <table><tr>
    `;
    
    for (let i = 0; i < firstDay; i++) html += "<td></td>";
    for (let d = 1; d <= daysInMonth; d++) {
      html += `<td>${d}</td>`;
      if ((d + firstDay) % 7 === 0) html += "</tr><tr>";
    }
    html += "</tr></table>";
    
    datePopup.innerHTML = html;
    
    datePopup.querySelector(".prev-month").onclick = () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      renderCalendar(currentDate);
    };
    
    datePopup.querySelector(".next-month").onclick = () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      renderCalendar(currentDate);
    };
  }
  
  dateInput.addEventListener("focus", () => {
    renderCalendar(currentDate);
    datePopup.style.display = "block";
  });
  
  datePopup.addEventListener("click", e => {
    if (e.target.tagName === "TD" && e.target.textContent) {
      const day = e.target.textContent.padStart(2, "0");
      const month = String(currentDate.getMonth() + 1).padStart(2, "0");
      const year = currentDate.getFullYear();
      dateInput.value = `${month}/${day}/${year}`;
      datePopup.style.display = "none";
    }
  });
  
  timeInput.addEventListener("focus", () => {
    let html = "";
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hour = h % 12 || 12;
        const min = String(m).padStart(2, "0");
        const ampm = h < 12 ? "AM" : "PM";
        html += `<div>${hour}:${min} ${ampm}</div>`;
      }
    }
    timePopup.innerHTML = html;
    timePopup.style.display = "block";
  });
  
  timePopup.addEventListener("click", e => {
    if (e.target.tagName === "DIV") {
      timeInput.value = e.target.textContent;
      timePopup.style.display = "none";
    }
  });
  
  document.addEventListener("click", e => {
    if (!dateInput.contains(e.target) && !datePopup.contains(e.target)) {
      datePopup.style.display = "none";
    }
    if (!timeInput.contains(e.target) && !timePopup.contains(e.target)) {
      timePopup.style.display = "none";
    }
  });
}

/* ========================================
   FORM SUBMISSION
   ======================================== */
function initFormSubmission(scope = document) {
  const submitBtn = scope.querySelector("#submit-btn");
  const visitForm = scope.querySelector("#visit-form");
  const formMessage = scope.querySelector("#form-message");
  
  if (submitBtn && visitForm && formMessage) {
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    
    newSubmitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      formMessage.textContent = "";
      
      const name = scope.querySelector("#full-name")?.value.trim() || "";
      const email = scope.querySelector("#email")?.value.trim() || "";
      const date = scope.querySelector("#visit-date")?.value.trim() || "";
      const time = scope.querySelector("#visit-time")?.value.trim() || "";
      const requests = scope.querySelector("#requests")?.value.trim() || "";
      
      if (!name || !email || !date || !time) {
        formMessage.textContent = "Please fill in all required fields.";
        formMessage.style.color = "#ff6b6b";
        return;
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        formMessage.textContent = "Please enter a valid email address.";
        formMessage.style.color = "#ff6b6b";
        return;
      }
      
      const data = new FormData();
      data.append("full_name", name);
      data.append("email", email);
      data.append("visit_date", date);
      data.append("visit_time", time);
      data.append("requests", requests);
      
      newSubmitBtn.disabled = true;
      newSubmitBtn.textContent = "Sending...";
      
      fetch("submit.php", {
        method: "POST",
        body: data
      })
        .then(res => res.text())
        .then(res => {
          formMessage.textContent = res;
          formMessage.style.color = "#4CAF50";
          visitForm.reset();
        })
        .catch(() => {
          formMessage.textContent = "Error submitting form. Please try again.";
          formMessage.style.color = "#ff6b6b";
        })
        .finally(() => {
          newSubmitBtn.disabled = false;
          newSubmitBtn.textContent = "Submit Inquiry";
        });
    });
  }
}

/* ========================================
   PREVENT RIGHT CLICK
   ======================================== */
if (slider) {
  slider.addEventListener('contextmenu', function(e) {
    e.preventDefault();
  });
  slider.addEventListener('touchstart', function(e) {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
}

/* ========================================
   INITIALIZATION
   ======================================== */
initPano(0);
updateSceneTitle(0);
initFormSubmission(document);

const currentNum = String(current + 1).padStart(2, '0');
const totalNum = String(slides.length).padStart(2, '0');
updateCounter(currentNum, totalNum);

});