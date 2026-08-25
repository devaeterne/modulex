export interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  originalPrice?: number;
  category: string;
  image: string;
  badge?: {
    text: string;
    color: string;
  };
  sku: string;
  tags: string[];
  description: string;
  dimensions?: {
    width: string;
    depth: string;
    height: string;
    seatHeight?: string;
  };
  materials: string[];
  images: string[];
}

export const products: Product[] = [
  {
    id: "1",
    slug: "velvet-lounge-chair",
    name: "Velvet Lounge Chair",
    price: 1299,
    category: "Living Room",
    image: "/assets/images/img(2).jpg",
    badge: {
      text: "New Arrival",
      color: "bg-dark",
    },
    sku: "VEL-001",
    tags: ["Modern", "Chair", "Velvet"],
    description:
      "Elevate your living space with our Velvet Lounge Chair. Upholstered in premium velvet fabric, this chair combines comfort with contemporary style. The solid wood frame ensures durability, while the high-density foam cushioning provides optimal support.",
    dimensions: {
      width: "32 inches",
      depth: "34 inches",
      height: "30 inches",
      seatHeight: "18 inches",
    },
    materials: ["Velvet upholstery", "Solid wood frame", "High-density foam"],
    images: [
      "/assets/images/img(2).jpg",
      "/assets/images/img(5).jpg",
      "/assets/images/img(4).jpg",
    ],
  },
  {
    id: "2",
    slug: "minimalist-bed-frame",
    name: "Minimalist Bed Frame",
    price: 2450,
    category: "Bedroom",
    image: "/assets/images/img(4).jpg",
    sku: "MIN-BED-002",
    tags: ["Minimalist", "Bedroom", "Wood"],
    description:
      "Create a serene bedroom retreat with our Minimalist Bed Frame. Crafted from sustainably sourced oak, this bed frame features clean lines and a low profile design. The sturdy slat system eliminates the need for a box spring.",
    dimensions: {
      width: "64 inches",
      depth: "84 inches",
      height: "12 inches",
    },
    materials: ["Solid oak wood", "Natural finish", "Sturdy slat system"],
    images: [
      "/assets/images/img(4).jpg",
      "/assets/images/img(2).jpg",
      "/assets/images/img(6).jpg",
    ],
  },
  {
    id: "3",
    slug: "marble-dining-table",
    name: "Marble Dining Table",
    price: 3800,
    category: "Dining Room",
    image: "/assets/images/img(6).jpg",
    sku: "MAR-TAB-003",
    tags: ["Luxury", "Dining", "Marble"],
    description:
      "Make a statement in your dining room with our exquisite Marble Dining Table. The genuine Carrara marble top sits atop a sculptural metal base, creating a stunning focal point for any gathering.",
    dimensions: {
      width: "72 inches",
      depth: "40 inches",
      height: "30 inches",
    },
    materials: ["Carrara marble top", "Powder-coated steel base"],
    images: [
      "/assets/images/img(6).jpg",
      "/assets/images/img(9).jpg",
      "/assets/images/img(10).jpg",
    ],
  },
  {
    id: "4",
    slug: "artisan-ceramic-vase",
    name: "Artisan Ceramic Vase",
    price: 125,
    category: "Decor",
    image: "/assets/images/img(9).jpg",
    sku: "ART-VASE-004",
    tags: ["Handmade", "Decor", "Ceramic"],
    description:
      "Add a touch of artistry to your home with our Artisan Ceramic Vase. Hand-thrown by skilled potters, each vase features a unique glaze pattern and organic shape. Perfect for displaying fresh flowers or as a standalone piece.",
    dimensions: {
      width: "8 inches",
      depth: "8 inches",
      height: "12 inches",
    },
    materials: ["Stoneware clay", "Lead-free glaze"],
    images: [
      "/assets/images/img(9).jpg",
      "/assets/images/img(6).jpg",
      "/assets/images/img(10).jpg",
    ],
  },
  {
    id: "5",
    slug: "leather-armchair",
    name: "Leather Armchair",
    price: 850,
    originalPrice: 1100,
    category: "Living Room",
    image: "/assets/images/img(5).jpg",
    badge: {
      text: "Sale",
      color: "bg-warning",
    },
    sku: "LEA-ARM-005",
    tags: ["Classic", "Chair", "Leather"],
    description:
      "Experience timeless comfort with our Leather Armchair. Upholstered in top-grain leather that ages beautifully, this chair features rolled arms and turned wood legs for a classic look.",
    dimensions: {
      width: "36 inches",
      depth: "38 inches",
      height: "34 inches",
      seatHeight: "19 inches",
    },
    materials: ["Top-grain leather", "Hardwood frame", "Pocket coil springs"],
    images: [
      "/assets/images/img(5).jpg",
      "/assets/images/img(2).jpg",
      "/assets/images/img(4).jpg",
    ],
  },
  {
    id: "6",
    slug: "modern-pendant-light",
    name: "Modern Pendant Light",
    price: 450,
    category: "Lighting",
    image: "/assets/images/img(10).jpg",
    sku: "MOD-LIG-006",
    tags: ["Modern", "Lighting", "Metal"],
    description:
      "Illuminate your space with our Modern Pendant Light. The sleek metal shade directs light downward, making it ideal for kitchen islands or dining tables. Compatible with LED bulbs for energy efficiency.",
    dimensions: {
      width: "14 inches",
      depth: "14 inches",
      height: "10 inches",
    },
    materials: ["Spun aluminum shade", "Adjustable cord", "E26 socket"],
    images: [
      "/assets/images/img(10).jpg",
      "/assets/images/img(9).jpg",
      "/assets/images/img(6).jpg",
    ],
  },
];
