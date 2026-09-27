// Mock data para J&M FASHION STORE — Moda Masculina Colombia

export const CATEGORIES = [
  { id: 'camisetas', name: 'Camisetas', slug: 'camisetas', count: 18, image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=800' },
  { id: 'camisas', name: 'Camisas', slug: 'camisas', count: 24, image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=800' },
  { id: 'polos', name: 'Polos', slug: 'polos', count: 12, image: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=800' },
  { id: 'jeans', name: 'Jeans', slug: 'jeans', count: 16, image: 'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&q=80&w=800' },
  { id: 'pantalones', name: 'Pantalones', slug: 'pantalones', count: 14, image: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&q=80&w=800' },
  { id: 'bermudas', name: 'Bermudas', slug: 'bermudas', count: 10, image: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=800' },
  { id: 'chaquetas', name: 'Chaquetas', slug: 'chaquetas', count: 15, image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800' },
  { id: 'calzado', name: 'Calzado', slug: 'calzado', count: 11, image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=800' },
  { id: 'accesorios', name: 'Accesorios', slug: 'accesorios', count: 9, image: 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?auto=format&fit=crop&q=80&w=800' }
];

export const OCCASIONS = [
  { id: 'trabajo', name: 'Trabajo & Oficina', subtitle: 'Elegancia ejecutiva sin perder confort', image: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&q=80&w=800' },
  { id: 'cita', name: 'Cita & Salidas', subtitle: 'Impacta con elegancia sutil', image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=800' },
  { id: 'casual', name: 'Casual Urbano', subtitle: 'Versatilidad para el día a día', image: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80&w=800' },
  { id: 'fiesta', name: 'Noche & Eventos', subtitle: 'Diseños contemporáneos de noche', image: 'https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?auto=format&fit=crop&q=80&w=800' },
  { id: 'fin-de-semana', name: 'Fin de Semana', subtitle: 'Frescura, relax y estilo sobrio', image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&q=80&w=800' },
  { id: 'streetwear', name: 'Streetwear Minimal', subtitle: 'Cortes relaxed y oversize con carácter', image: 'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&q=80&w=800' }
];

export const STYLE_LINES = [
  {
    id: 'urbana',
    name: 'Línea Urbana',
    slug: 'urbana',
    tagline: 'Streetwear Moderno & Relajado',
    description: 'Cortes oversize, siluetas relaxed, camisetas heavyweight y actitud urbana contemporánea.',
    image: 'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&q=80&w=1000',
    badge: 'ESTILO RELAJADO'
  },
  {
    id: 'elegante',
    name: 'Línea Elegante',
    slug: 'elegante',
    tagline: 'Ejecutivo & Algodón-Seda Premium',
    description: 'Polos mercerizados con seda, camisas Oxford de alta puntada, pantalones drill y zapatos de vestir en cuero.',
    image: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&q=80&w=1000',
    badge: 'OFICINA & FORMAL'
  },
  {
    id: 'casual',
    name: 'Línea Smart Casual',
    slug: 'casual',
    tagline: 'Versatilidad Elegante & Mezclilla',
    description: 'Mezcla perfecta entre elegancia y frescura: jeans selvedge de mezclilla, mocasines y chaquetas impecables.',
    image: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80&w=1000',
    badge: 'CASUAL ELEGANTE'
  }
];

export const PRODUCTS = [
  {
    id: 'prod-1',
    name: 'Camiseta Heavyweight Oversize Essential',
    slug: 'camiseta-heavyweight-oversize-essential',
    category: 'camisetas',
    styleLine: 'urbana',
    price: 129900,
    originalPrice: 159900,
    discountPercent: 18,
    isNew: true,
    isBestSeller: true,
    isSale: true,
    rating: 4.9,
    reviewCount: 34,
    fit: 'OVERSIZE',
    occasion: 'streetwear',
    color: 'Negro Azabache',
    colors: [
      { name: 'Negro Azabache', hex: '#121212', selected: true },
      { name: 'Blanco Nieve', hex: '#FFFFFF', selected: false },
      { name: 'Gris Grafito', hex: '#383838', selected: false },
      { name: 'Beige Arena', hex: '#D7C4B7', selected: false }
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    images: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'Camiseta de algodón pesado de 240g con horma Oversize moderna de la firma J&M. Caída estructurada, cuello reforzado de 3cm y costuras de alta durabilidad.',
    details: [
      '100% Algodón peruano seleccionado de 240g',
      'Cuello en rib grueso anti-deformación',
      'Corte de hombro caído (Oversize Fit)',
      'Lavado reactivo para cero encogimiento y máxima fijación de color',
      'Hecho en Colombia'
    ],
    fitDescription: 'Diseñada con hombros ligeramente caídos y mayor holgura en el tórax. Te recomendamos pedir tu talla habitual para un look holgado o una talla menos si prefieres un ajuste más estándar.'
  },
  {
    id: 'prod-2',
    name: 'Camisa Oxford Premium Manga Larga',
    slug: 'camisa-oxford-premium-manga-larga',
    category: 'camisas',
    styleLine: 'elegante',
    price: 189900,
    originalPrice: null,
    discountPercent: 0,
    isNew: true,
    isBestSeller: true,
    isSale: false,
    rating: 4.8,
    reviewCount: 52,
    fit: 'SLIM',
    occasion: 'trabajo',
    color: 'Azul Celeste',
    colors: [
      { name: 'Azul Celeste', hex: '#7BACD6', selected: true },
      { name: 'Blanco Puro', hex: '#FFFFFF', selected: false },
      { name: 'Azul Marino', hex: '#1B2A4A', selected: false }
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    images: [
      'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'La camisa Oxford definitiva. Confeccionada con tejido de algodón peinado con textura sutil, perfecta para el entorno profesional o salidas informales elegantes.',
    details: [
      '100% Algodón Oxford transpirable',
      'Cuello botoné de silueta limpia',
      'Botones de resina natural grabados J&M',
      'Puntada fina de 7 puntadas por centímetro',
      'Tratamiento de planchado fácil'
    ],
    fitDescription: 'Ajuste Slim estilizado que se amolda suavemente al cuerpo sin apretar.'
  },
  {
    id: 'prod-3',
    name: 'Polo Piqué Mercerizado Silk-Blend',
    slug: 'polo-pique-mercerizado-silk-blend',
    category: 'polos',
    styleLine: 'elegante',
    price: 169900,
    originalPrice: 199900,
    discountPercent: 15,
    isNew: true,
    isBestSeller: true,
    isSale: true,
    rating: 4.9,
    reviewCount: 41,
    fit: 'REGULAR',
    occasion: 'trabajo',
    color: 'Negro Mate',
    colors: [
      { name: 'Negro Mate', hex: '#181818', selected: true },
      { name: 'Verde Olivo', hex: '#4A5B43', selected: false },
      { name: 'Blanco Marfil', hex: '#F9F8F6', selected: false }
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    images: [
      'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1625910513413-09477028448f?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'Polo ejecutivo confeccionado en mezcla de algodón peruano con fibra tipo seda. Brillo sutil, elasticidad natural y tacto ultrafino ideal para la oficina contemporánea.',
    details: [
      '85% Algodón Piqué Mercerizado, 15% Fibras de Seda & Elastano',
      'Cuello de tejido rectilíneo anti-arrugas',
      'Ajuste impecable para combinar con sacos o pantalones drill',
      'Tejido termo-regulador ultra suave'
    ],
    fitDescription: 'Corte Regular impecable que ofrece espacio cómodo en torso y cintura.'
  },
  {
    id: 'prod-4',
    name: 'Jean Selvedge Mezclilla Denim Dark Vintage',
    slug: 'jean-selvedge-mezclilla-denim-dark-vintage',
    category: 'jeans',
    styleLine: 'casual',
    price: 239900,
    originalPrice: null,
    discountPercent: 0,
    isNew: true,
    isBestSeller: true,
    isSale: false,
    rating: 4.8,
    reviewCount: 29,
    fit: 'SLIM',
    occasion: 'casual',
    color: 'Índigo Oscuro',
    colors: [
      { name: 'Índigo Oscuro', hex: '#1C2742', selected: true },
      { name: 'Azul Medio Vintage', hex: '#3B577D', selected: false },
      { name: 'Negro Washed', hex: '#262626', selected: false }
    ],
    sizes: ['30', '32', '34', '36'],
    images: [
      'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'Jean de mezclilla selvedge de 13oz. El balance Smart Casual perfecto: comodidad relajada con corte pulido que proyecta elegancia desenfadada.',
    details: [
      '98% Mezclilla Denim de 13oz, 2% Spandex para flexibilidad superior',
      'Remaches y botón metálico grabado J&M',
      'Ribete selvedge rojo visible en dobladillo',
      'Cierre YKK original de alta resistencia'
    ],
    fitDescription: 'Ajuste Slim desde la cadera hasta el tobillo con apertura de bota perfecta para tenis o mocasines.'
  },
  {
    id: 'prod-5',
    name: 'Pantalón Drill Tailored Stretch Oficina',
    slug: 'pantalon-drill-tailored-stretch-oficina',
    category: 'pantalones',
    styleLine: 'elegante',
    price: 209900,
    originalPrice: 249900,
    discountPercent: 16,
    isNew: false,
    isBestSeller: true,
    isSale: true,
    rating: 4.9,
    reviewCount: 68,
    fit: 'REGULAR',
    occasion: 'trabajo',
    color: 'Camel / Khaki',
    colors: [
      { name: 'Camel / Khaki', hex: '#C2A382', selected: true },
      { name: 'Azul Marino', hex: '#1E293B', selected: false },
      { name: 'Gris Plomo', hex: '#475569', selected: false }
    ],
    sizes: ['30', '32', '34', '36'],
    images: [
      'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'Pantalón tipo drill ejecutivo confeccionado en sarga de algodón stretch. Apariencia elegante para oficina con máxima soltura al sentarse.',
    details: [
      'Drill de algodón esmerilado supersuave (97% Algodón, 3% Elastano)',
      'Pretina elástica interna secreta para confort en jornadas largas',
      'Bolsillo de seguridad oculto con cremallera',
      'Puntadas invisibles en el dobladillo'
    ],
    fitDescription: 'Corte Regular sastreado con caída recta limpia.'
  },
  {
    id: 'prod-6',
    name: 'Chaqueta Bomber Streetwear Urban Heritage',
    slug: 'chaqueta-bomber-streetwear-urban-heritage',
    category: 'chaquetas',
    styleLine: 'urbana',
    price: 299900,
    originalPrice: 349900,
    discountPercent: 14,
    isNew: true,
    isBestSeller: true,
    isSale: true,
    rating: 5.0,
    reviewCount: 29,
    fit: 'REGULAR',
    occasion: 'streetwear',
    color: 'Negro Mineral',
    colors: [
      { name: 'Negro Mineral', hex: '#1F1F1F', selected: true },
      { name: 'Verde Olivo', hex: '#2C4263', selected: false }
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    images: [
      'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'Chaqueta bomber de silueta urbana relajada. Acabado semi-impermeable, bolsillos funcionales y actitud streetwear sobria.',
    details: [
      'Tejido técnico de poliéster de alta densidad resistente al agua',
      'Puños y pretina rectilíneos reforzados',
      'Bolsillo táctico en manga izquierda con cierre metálico',
      'Forro interno térmico liviano'
    ],
    fitDescription: 'Corte Regular estructurado que permite llevar capas internas como camisetas oversize o sacos.'
  },
  {
    id: 'prod-7',
    name: 'Zapatos Oxford Formal Dress Leather',
    slug: 'zapatos-oxford-formal-dress-leather',
    category: 'calzado',
    styleLine: 'elegante',
    price: 349900,
    originalPrice: null,
    discountPercent: 0,
    isNew: true,
    isBestSeller: true,
    isSale: false,
    rating: 4.9,
    reviewCount: 42,
    fit: 'REGULAR',
    occasion: 'trabajo',
    color: 'Café Tabaco',
    colors: [
      { name: 'Café Tabaco', hex: '#4A2E1A', selected: true },
      { name: 'Negro Azabache', hex: '#111111', selected: false }
    ],
    sizes: ['38', '39', '40', '41', '42', '43'],
    images: [
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1560769629-975ec94e6a86?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'Zapato de vestir tipo Oxford en 100% cuero vacuno natural. Puntera limpia, acentuación de pátina hecha a mano y suela elegante para trajes o pantalones drill.',
    details: [
      '100% Cuero Vacuno Grano Entero con pátina artesanal',
      'Construcción de suela en curo y goma anti-deslizante',
      'Plantilla acolchada en cuero de res de alta absorción',
      'Cordones de algodón encerado'
    ],
    fitDescription: 'Horma clásica elegante de calce cómodo. Elige tu talla estándar de calzado.'
  },
  {
    id: 'prod-8',
    name: 'Mocasines Smart Casual Loafers Leather',
    slug: 'mocasines-smart-casual-loafers-leather',
    category: 'calzado',
    styleLine: 'casual',
    price: 319900,
    originalPrice: 359900,
    discountPercent: 11,
    isNew: true,
    isBestSeller: true,
    isSale: true,
    rating: 4.8,
    reviewCount: 31,
    fit: 'REGULAR',
    occasion: 'casual',
    color: 'Miel Gamuza',
    colors: [
      { name: 'Miel Gamuza', hex: '#B8860B', selected: true },
      { name: 'Azul Marino Gamuza', hex: '#1E293B', selected: false }
    ],
    sizes: ['38', '39', '40', '41', '42', '43'],
    images: [
      'https://images.unsplash.com/photo-1560769629-975ec94e6a86?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'Mocasines estilo Penny Loafer en gamuza de cuero suave. Diseñados para combinar con jeans de mezclilla o bermudas proyectando elegancia sin esfuerzo.',
    details: [
      'Capellada 100% Gamuza de Cuero Vacuno suave',
      'Construcción mocasín flexible sin forro rígido',
      'Suela de goma liviana con tacos de agarre',
      'Plantilla interna acolchada en cuero'
    ],
    fitDescription: 'Calce suave y amoldable. Si usas media talla, te recomendamos bajar a la talla inferior.'
  },
  {
    id: 'prod-9',
    name: 'Bermuda Chino Comfort Walk Short',
    slug: 'bermuda-chino-comfort-walk-short',
    category: 'bermudas',
    styleLine: 'urbana',
    price: 139900,
    originalPrice: 169900,
    discountPercent: 17,
    isNew: false,
    isBestSeller: false,
    isSale: true,
    rating: 4.6,
    reviewCount: 15,
    fit: 'RELAXED',
    occasion: 'fin-de-semana',
    color: 'Beige Lino',
    colors: [
      { name: 'Beige Lino', hex: '#E3D7C5', selected: true },
      { name: 'Azul Naval', hex: '#1C2E4A', selected: false },
      { name: 'Verde Caqui', hex: '#556B2F', selected: false }
    ],
    sizes: ['30', '32', '34', '36'],
    images: [
      'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1565084888279-aca607ecce0c?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'Bermuda de corte limpio a la rodilla en sarga liviana. Perfecta para viajes, playa o días calurosos.',
    details: [
      '97% Algodón, 3% Elastano',
      'Largo de entrepierna: 7 pulgadas',
      'Pretina plana con trabillas para correa',
      'Cierre con cremallera y botón de cuerno'
    ],
    fitDescription: 'Corte Relaxed con espacio fresco en muslos.'
  }
];

export const LOOKS = [
  {
    id: 'look-1',
    title: 'El Outfit Urbano Minimalista',
    subtitle: 'Combinación limpia de tonos oscuros y tenis blancos',
    image: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80&w=1000',
    products: ['prod-1', 'prod-4', 'prod-7'],
    totalPrice: 699700,
    bundleDiscountPrice: 629900,
    savings: 69800
  },
  {
    id: 'look-2',
    title: 'Estilo Ejecutivo Casual',
    subtitle: 'Camisa Oxford estructurada + Pantalón Chino Stretch',
    image: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&q=80&w=1000',
    products: ['prod-2', 'prod-5', 'prod-7'],
    totalPrice: 729700,
    bundleDiscountPrice: 659900,
    savings: 69800
  }
];

export const REVIEWS = [
  {
    id: 'rev-1',
    author: 'Camilo M.',
    city: 'Bogotá',
    rating: 5,
    date: '14 de Septiembre, 2026',
    verified: true,
    title: 'Calidad superior, el fit es perfecto',
    comment: 'La camiseta Heavyweight superó mis expectativas. El algodón es grueso y no perdió su forma al lavarla. La entrega a Bogotá tardó solo 2 días.'
  },
  {
    id: 'rev-2',
    author: 'Felipe R.',
    city: 'Medellín',
    rating: 5,
    date: '02 de Septiembre, 2026',
    verified: true,
    title: 'Gran atención y acabados premium',
    comment: 'Compré la camisa Oxford y el jean Selvedge. La confección colombiana se nota en cada costura. 100% recomendado.'
  },
  {
    id: 'rev-3',
    author: 'Santiago G.',
    city: 'Cali',
    rating: 5,
    date: '28 de Agosto, 2026',
    verified: true,
    title: 'Tenis increíblemente cómodos',
    comment: 'Los tenis blancos minimalistas se sienten super suaves en la plantilla. Calzo 41 y la talla quedó impecable.'
  }
];

export const SIZE_CHART = {
  camisetas: [
    { size: 'S', chest: '92 - 97 cm', waist: '76 - 81 cm', length: '70 cm' },
    { size: 'M', chest: '98 - 103 cm', waist: '82 - 87 cm', length: '72 cm' },
    { size: 'L', chest: '104 - 109 cm', waist: '88 - 93 cm', length: '74 cm' },
    { size: 'XL', chest: '110 - 115 cm', waist: '94 - 99 cm', length: '76 cm' },
    { size: 'XXL', chest: '116 - 122 cm', waist: '100 - 105 cm', length: '78 cm' }
  ],
  camisas: [
    { size: 'S', chest: '94 - 98 cm', collar: '38 cm', sleeve: '64 cm' },
    { size: 'M', chest: '99 - 104 cm', collar: '40 cm', sleeve: '65 cm' },
    { size: 'L', chest: '105 - 110 cm', collar: '42 cm', sleeve: '66 cm' },
    { size: 'XL', chest: '111 - 116 cm', collar: '44 cm', sleeve: '67 cm' }
  ],
  jeans: [
    { size: '30', waist: '76 - 79 cm', hip: '92 - 95 cm', length: '102 cm' },
    { size: '32', waist: '81 - 84 cm', hip: '97 - 100 cm', length: '104 cm' },
    { size: '34', waist: '86 - 89 cm', hip: '102 - 105 cm', length: '105 cm' },
    { size: '36', waist: '91 - 94 cm', hip: '107 - 110 cm', length: '106 cm' }
  ],
  calzado: [
    { size: '38', footLength: '24.5 cm', us: '7' },
    { size: '39', footLength: '25.0 cm', us: '7.5' },
    { size: '40', footLength: '25.8 cm', us: '8.5' },
    { size: '41', footLength: '26.5 cm', us: '9.5' },
    { size: '42', footLength: '27.2 cm', us: '10' },
    { size: '43', footLength: '28.0 cm', us: '11' }
  ]
};

export const FITS_INFO = [
  {
    name: 'SLIM',
    tagline: 'Entallado moderno y silueta limpia',
    description: 'Sigue la forma del cuerpo estrechándose en tórax, brazos o piernas sin restringir el movimiento.',
    recommendedFor: 'Hombres que prefieren un look ajustado y pulido.'
  },
  {
    name: 'REGULAR',
    tagline: 'El equilibrio clásico atemporal',
    description: 'Corte tradicional rectilíneo que otorga holgura natural y confort durante todo el día.',
    recommendedFor: 'Ideal para todo tipo de cuerpo y uso versátil.'
  },
  {
    name: 'RELAXED',
    tagline: 'Frescura, amplitud y caída ligera',
    description: 'Ligeramente más amplio en hombros, pecho y muslos para un aire relajado y desenfadado.',
    recommendedFor: 'Quienes buscan máxima soltura y movilidad en clima templado/cálido.'
  },
  {
    name: 'OVERSIZE',
    tagline: 'Silueta urbana vanguardista',
    description: 'Corte amplio intencional con hombros caídos y volumen holgado de alta moda masculina.',
    recommendedFor: 'Amantes del streetwear contemporáneo y confort holgado.'
  }
];

export const formatCOP = (amount) => {
  if (typeof amount !== 'number') return '$0';
  return '$' + amount.toLocaleString('es-CO');
};
