import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Ruler,
  Truck,
  RotateCcw,
  HelpCircle,
  Mail,
  ShieldCheck,
  Building,
  FileText,
  Lock,
  ChevronDown,
  ChevronUp,
  MapPin,
  Phone,
  MessageCircle,
  Instagram,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { SIZE_CHART } from '../data/mockData';

export const InfoPage = () => {
  const location = useLocation();
  const path = location.pathname;

  // Determine view type based on current URL path
  let viewType = 'tallas';
  if (path === '/guia-de-tallas') viewType = 'tallas';
  else if (path === '/envios') viewType = 'envios';
  else if (path === '/cambios-y-devoluciones' || path === '/politica-de-cambios') viewType = 'cambios';
  else if (path === '/preguntas-frecuentes') viewType = 'faq';
  else if (path === '/contacto') viewType = 'contacto';
  else if (path === '/nosotros') viewType = 'nosotros';
  else if (path === '/tiendas') viewType = 'tiendas';
  else if (path === '/terminos') viewType = 'terminos';
  else if (path === '/privacidad') viewType = 'privacidad';

  // State for Size Chart Tab in Tallas section
  const [sizeTab, setSizeTab] = useState('camisetas');

  // State for FAQ Accordion
  const [openFaq, setOpenFaq] = useState({ 0: true });

  const toggleFaq = (idx) => {
    setOpenFaq((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const currentChart = SIZE_CHART[sizeTab] || SIZE_CHART.camisetas;

  const faqs = [
    {
      q: '¿Cuáles son las opciones y tiempos de envío en Colombia?',
      a: 'Realizamos envíos a nivel nacional a través de transportadoras aliadas de alta confiabilidad. El tiempo estimado de entrega para Bogotá, Medellín, Cali y ciudades principales es de 2 a 4 días hábiles. Para municipios intermedios el tiempo estimado es de 3 a 6 días hábiles. Todos los pedidos superiores a $200.000 COP cuentan con Envío Gratis.'
    },
    {
      q: '¿Cómo solicito un cambio de talla o prenda?',
      a: 'Cuentas con hasta 30 días calendario tras recibir tu pedido para solicitar cualquier cambio por talla o prenda. La prenda debe encontrarse en estado nuevo, sin uso y con sus etiquetas originales. Puedes iniciar la solicitud contactando directamente a nuestro canal de soporte en WhatsApp (+57 300 000 0000).'
    },
    {
      q: '¿Cuáles son los medios de pago disponibles?',
      a: 'Aceptamos pagos 100% seguros mediante nuestra pasarela en línea: Tarjetas de Crédito/Débito (Visa, Mastercard, American Express), PSE (todos los bancos colombianos), Nequi, Daviplata y Transferencia Bancaria.'
    },
    {
      q: '¿Cómo saber cuál es mi talla exacta?',
      a: 'Te recomendamos revisar nuestra Guía de Tallas interactiva basada en centímetros reales de pecho, cintura y cadera. Si te encuentras entre dos tallas, para cortes SLIM aconsejamos seleccionar la talla superior, y para cortes OVERSIZE/REGULAR tu talla estándar.'
    },
    {
      q: '¿Dónde están ubicadas las prendas y desde dónde se despachan?',
      a: 'Todas las prendas de J&M Fashion Store son confeccionadas y preparadas directamente en nuestro Centro de Distribución y Bodega Central en Colombia, garantizando control total sobre los estándares de confección.'
    },
    {
      q: '¿Tienen tienda física para probarme las prendas?',
      a: 'Sí, disponemos de nuestro Showroom Flagship principal en Bogotá y puntos de atención aliados en Medellín. Puedes consultar la ubicación exacta y horarios en la sección Tiendas.'
    }
  ];

  return (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '80vh', padding: '3rem 0 5rem 0' }}>
      <div className="jm-container" style={{ maxWidth: '1000px' }}>
        
        {/* BREADCRUMB */}
        <div style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '2rem' }}>
          <Link to="/" style={{ color: '#71717A' }}>Inicio</Link>
          <span style={{ margin: '0 0.5rem' }}>/</span>
          <strong style={{ color: '#09090B', textTransform: 'capitalize' }}>
            {viewType === 'tallas' && 'Guía de Tallas'}
            {viewType === 'envios' && 'Información de Envíos'}
            {viewType === 'cambios' && 'Garantía, Cambios y Devoluciones'}
            {viewType === 'faq' && 'Preguntas Frecuentes'}
            {viewType === 'contacto' && 'Atención & Contacto'}
            {viewType === 'nosotros' && 'Sobre J&M Fashion Store'}
            {viewType === 'tiendas' && 'Nuestras Tiendas'}
            {viewType === 'terminos' && 'Términos y Condiciones'}
            {viewType === 'privacidad' && 'Política de Privacidad'}
          </strong>
        </div>

        {/* 1. GUÍA DE TALLAS */}
        {viewType === 'tallas' && (
          <div>
            <div style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#D4AF37', marginBottom: '0.3rem' }}>
                <Ruler size={22} />
                <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>TABLA DE MEDIDAS CORPORALES</span>
              </div>
              <h1 style={{ fontSize: '2.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>
                GUÍA DE TALLAS J&M
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#71717A', marginTop: '0.5rem' }}>
                Encuentra el ajuste perfecto para tu contextura. Medidas corporales de referencia en centímetros (cm).
              </p>
            </div>

            {/* TAB SELECTOR */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
              {['camisetas', 'camisas', 'jeans', 'calzado'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSizeTab(tab)}
                  style={{
                    padding: '0.65rem 1.25rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    borderRadius: '6px',
                    border: sizeTab === tab ? '1.5px solid #09090B' : '1px solid #E4E4E7',
                    backgroundColor: sizeTab === tab ? '#09090B' : '#FFFFFF',
                    color: sizeTab === tab ? '#FFFFFF' : '#71717A',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab === 'jeans' ? 'Jeans & Pantalones' : tab}
                </button>
              ))}
            </div>

            {/* MEASUREMENTS TABLE */}
            <div style={{ backgroundColor: '#FAFAFA', borderRadius: '10px', border: '1px solid #E4E4E7', padding: '1.5rem', overflowX: 'auto', marginBottom: '3rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E4E4E7', backgroundColor: '#FFFFFF' }}>
                    <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 900 }}>TALLA J&M</th>
                    {sizeTab === 'camisetas' && (
                      <>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>TÓRAX / PECHO</th>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>CINTURA</th>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>LARGO TOTAL</th>
                      </>
                    )}
                    {sizeTab === 'camisas' && (
                      <>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>TÓRAX</th>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>CUELLO</th>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>LARGO MANGA</th>
                      </>
                    )}
                    {sizeTab === 'jeans' && (
                      <>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>CINTURA</th>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>CADERA</th>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>LARGO BOTA</th>
                      </>
                    )}
                    {sizeTab === 'calzado' && (
                      <>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>LARGO DEL PIE (CM)</th>
                        <th style={{ padding: '0.85rem 1rem', color: '#09090B', fontWeight: 800 }}>TALLA US EQUIVALENTE</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {currentChart.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #E4E4E7', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 900, color: '#09090B' }}>{row.size}</td>
                      {sizeTab === 'camisetas' && (
                        <>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>{row.chest}</td>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>{row.waist}</td>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>{row.length}</td>
                        </>
                      )}
                      {sizeTab === 'camisas' && (
                        <>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>{row.chest}</td>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>{row.collar}</td>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>{row.sleeve}</td>
                        </>
                      )}
                      {sizeTab === 'jeans' && (
                        <>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>{row.waist}</td>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>{row.hip}</td>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>{row.length}</td>
                        </>
                      )}
                      {sizeTab === 'calzado' && (
                        <>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>{row.footLength}</td>
                          <td style={{ padding: '0.85rem 1rem', color: '#27272A' }}>US {row.us}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* INSTRUCTIONS & RECOMMENDATIONS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
              <div style={{ border: '1px solid #E4E4E7', padding: '1.5rem', borderRadius: '10px' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#09090B', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                  ¿CÓMO MEDIR TU CUERPO?
                </h4>
                <ul style={{ fontSize: '0.85rem', color: '#71717A', lineHeight: 1.6, paddingLeft: '1.2rem' }}>
                  <li><strong>Pecho / Tórax:</strong> Mide el contorno por debajo de las axilas en la parte más prominente.</li>
                  <li><strong>Cintura:</strong> Pasa la cinta sobre el contorno natural de tu cintura horizontalmente.</li>
                  <li><strong>Cadera:</strong> Mantén los pies juntos y mide la parte con mayor volumen de la cadera.</li>
                </ul>
              </div>

              <div style={{ border: '1px solid #D4AF37', backgroundColor: '#FAFAFA', padding: '1.5rem', borderRadius: '10px' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#09090B', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                  RECOMENDACIÓN ENTRE TALLAS
                </h4>
                <p style={{ fontSize: '0.85rem', color: '#71717A', lineHeight: 1.6, margin: 0 }}>
                  Si tus medidas se encuentran entre dos tallas: elige la talla menor si prefieres un ajuste estilizado y entallado (Slim), o la talla mayor si buscas libertad de movimiento y confort relajado.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. INFORMACIÓN DE ENVÍOS */}
        {viewType === 'envios' && (
          <div>
            <div style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#D4AF37', marginBottom: '0.3rem' }}>
                <Truck size={22} />
                <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>LOGÍSTICA & ENTREGA NACIONAL</span>
              </div>
              <h1 style={{ fontSize: '2.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>
                ENVÍOS A TODO COLOMBIA
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#71717A', marginTop: '0.5rem' }}>
                Información transparente sobre tarifas, tiempos y cobertura de entrega.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
              <div style={{ border: '1px solid #E4E4E7', borderRadius: '10px', padding: '1.75rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', marginBottom: '1rem', textTransform: 'uppercase' }}>
                  📦 TIEMPOS DE ENTREGA ESTIMADOS
                </h3>
                <ul style={{ fontSize: '0.88rem', color: '#71717A', lineHeight: 1.7, paddingLeft: '1.2rem' }}>
                  <li><strong>Bogotá, Medellín y Cali:</strong> 2 a 4 días hábiles.</li>
                  <li><strong>Ciudades Principales:</strong> 3 a 5 días hábiles.</li>
                  <li><strong>Municipios & Zonas Especiales:</strong> 4 a 7 días hábiles.</li>
                </ul>
              </div>

              <div style={{ border: '1px solid #E4E4E7', borderRadius: '10px', padding: '1.75rem', backgroundColor: '#FAFAFA' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', marginBottom: '1rem', textTransform: 'uppercase' }}>
                  💰 COSTOS & ENVÍO GRATIS
                </h3>
                <div style={{ fontSize: '0.88rem', color: '#71717A', lineHeight: 1.6 }}>
                  <p style={{ marginBottom: '0.75rem' }}>
                    <strong style={{ color: '#09090B' }}>ENVÍO GRATIS:</strong> En todos los pedidos con monto total igual o superior a <strong>$200.000 COP</strong>.
                  </p>
                  <p>
                    <strong style={{ color: '#09090B' }}>Tarifa Estándar:</strong> $15.000 COP para compras inferiores al monto mínimo.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid #E4E4E7', borderRadius: '10px', padding: '2rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                🔎 SEGUIMIENTO DE TU PEDIDO
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#71717A', lineHeight: 1.6 }}>
                Tan pronto tu paquete es despachado desde nuestro centro de distribución, recibirás un número de guía y enlace directo vía correo electrónico o WhatsApp para rastrear tu envío en tiempo real.
              </p>
            </div>
          </div>
        )}

        {/* 3. CAMBIOS Y DEVOLUCIONES */}
        {viewType === 'cambios' && (
          <div>
            <div style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#D4AF37', marginBottom: '0.3rem' }}>
                <RotateCcw size={22} />
                <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>POLÍTICA DE SATISFACCIÓN</span>
              </div>
              <h1 style={{ fontSize: '2.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>
                CAMBIOS Y DEVOLUCIONES
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#71717A', marginTop: '0.5rem' }}>
                Solicita tu cambio de talla o prenda en un plazo de hasta 30 días calendario.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', fontSize: '0.9rem', color: '#71717A', lineHeight: 1.7 }}>
              <div style={{ border: '1px solid #E4E4E7', padding: '1.5rem', borderRadius: '10px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#09090B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  1. REQUISITOS PARA SOLICITAR CAMBIO
                </h3>
                <ul style={{ paddingLeft: '1.2rem' }}>
                  <li>La prenda debe contar con sus etiquetas originales intactas.</li>
                  <li>No debe presentar signos de uso, lavado, manchas ni alteraciones.</li>
                  <li>Presentar la factura o número de orden digital correspondiente.</li>
                </ul>
              </div>

              <div style={{ border: '1px solid #E4E4E7', padding: '1.5rem', borderRadius: '10px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#09090B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  2. PASOS PARA PROCESAR EL CAMBIO
                </h3>
                <ol style={{ paddingLeft: '1.2rem' }}>
                  <li>Comunícate con nuestra línea oficial de atención en WhatsApp (+57 300 000 0000).</li>
                  <li>Indica tu número de orden y la talla o prenda por la que deseas realizar el cambio.</li>
                  <li>Coordina el envío o recogida del producto de manera ágil sin trámites confusos.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* 4. PREGUNTAS FRECUENTES */}
        {viewType === 'faq' && (
          <div>
            <div style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#D4AF37', marginBottom: '0.3rem' }}>
                <HelpCircle size={22} />
                <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>RESOLUCIÓN DE DUDAS</span>
              </div>
              <h1 style={{ fontSize: '2.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>
                PREGUNTAS FRECUENTES
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#71717A', marginTop: '0.5rem' }}>
                Respuestas inmediatas a las consultas habituales de nuestros clientes.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {faqs.map((faq, idx) => {
                const isOpen = !!openFaq[idx];
                return (
                  <div
                    key={idx}
                    style={{
                      border: '1px solid #E4E4E7',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: '#FFFFFF'
                    }}
                  >
                    <button
                      onClick={() => toggleFaq(idx)}
                      style={{
                        width: '100%',
                        padding: '1.25rem 1.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        textAlign: 'left',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        color: '#09090B',
                        backgroundColor: isOpen ? '#FAFAFA' : '#FFFFFF',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <span>{faq.q}</span>
                      {isOpen ? <ChevronUp size={20} color="#09090B" /> : <ChevronDown size={20} color="#71717A" />}
                    </button>

                    {isOpen && (
                      <div style={{ padding: '1.25rem 1.5rem', fontSize: '0.88rem', color: '#71717A', lineHeight: 1.6, borderTop: '1px solid #F4F4F5' }}>
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. CONTACTO */}
        {viewType === 'contacto' && (
          <div>
            <div style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#D4AF37', marginBottom: '0.3rem' }}>
                <Mail size={22} />
                <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>CANALES DIRECTOS</span>
              </div>
              <h1 style={{ fontSize: '2.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>
                ATENCIÓN & CONTACTO
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#71717A', marginTop: '0.5rem' }}>
                Estamos listos para asesorarte con tu compra, talla o pedido.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
              <div style={{ border: '1px solid #E4E4E7', padding: '2rem', borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <MessageCircle size={28} color="#25D366" />
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', margin: 0 }}>WHATSAPP OFICIAL</h3>
                    <span style={{ fontSize: '0.78rem', color: '#71717A' }}>Respuesta en menos de 10 minutos</span>
                  </div>
                </div>
                <p style={{ fontSize: '0.88rem', color: '#71717A', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  Recibe atención personalizada para recomendación de tallas, estado de órdenes o consultas generales.
                </p>
                <a
                  href="https://wa.me/573000000000"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    backgroundColor: '#09090B',
                    color: '#FFFFFF',
                    padding: '0.85rem 1.4rem',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase'
                  }}
                >
                  ABRIR CHAT WHATSAPP
                </a>
              </div>

              <div style={{ border: '1px solid #E4E4E7', padding: '2rem', borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <Instagram size={28} color="#D4AF37" />
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', margin: 0 }}>INSTAGRAM</h3>
                    <span style={{ fontSize: '0.78rem', color: '#71717A' }}>Comunidad & Novedades</span>
                  </div>
                </div>
                <p style={{ fontSize: '0.88rem', color: '#71717A', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  Síguenos para estar al día con los nuevos lanzamientos y editoriales de estilo.
                </p>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    backgroundColor: '#FFFFFF',
                    border: '1.5px solid #09090B',
                    color: '#09090B',
                    padding: '0.85rem 1.4rem',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase'
                  }}
                >
                  VER INSTAGRAM
                </a>
              </div>
            </div>
          </div>
        )}

        {/* 6. SOBRE NOSOTROS */}
        {viewType === 'nosotros' && (
          <div>
            <div style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#D4AF37', marginBottom: '0.3rem' }}>
                <Sparkles size={22} />
                <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>NUESTRA FIRMA</span>
              </div>
              <h1 style={{ fontSize: '2.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>
                SOBRE J&M FASHION STORE
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#71717A', marginTop: '0.5rem' }}>
                Estilo masculino contemporáneo con confección y textiles de alta gama hechos en Colombia.
              </p>
            </div>

            <div style={{ fontSize: '0.92rem', color: '#71717A', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <p>
                En <strong>J&M Fashion Store</strong> creemos que la moda masculina trasciende las tendencias pasajeras. Nos enfocamos en diseñar prendas que equilibran elegancia atemporal, comodidad diaria y carácter sobrio para el hombre contemporáneo.
              </p>
              <p>
                Cada una de nuestras prendas —desde nuestras Camisetas Heavyweight de algodón peruano seleccionado hasta nuestras Camisas Oxford y Jeans Selvedge de 13oz— es elaborada bajo rigurosos controles de calidad en Colombia, priorizando fibras nobles, durabilidad y cortes impecables.
              </p>
            </div>
          </div>
        )}

        {/* 7. TIENDAS */}
        {viewType === 'tiendas' && (
          <div>
            <div style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#D4AF37', marginBottom: '0.3rem' }}>
                <Building size={22} />
                <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>UBICACIONES FÍSICAS</span>
              </div>
              <h1 style={{ fontSize: '2.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>
                NUESTRAS TIENDAS
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#71717A', marginTop: '0.5rem' }}>
                Puntos de atención e inspección de prendas presencial.
              </p>
            </div>

            <div style={{ border: '1px solid #E4E4E7', borderRadius: '10px', padding: '2rem', backgroundColor: '#FAFAFA', maxWidth: '600px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <MapPin size={24} color="#09090B" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', margin: 0, textTransform: 'uppercase' }}>
                  SHOWROOM & FLAGSHIP BOGOTÁ
                </h3>
              </div>
              <p style={{ fontSize: '0.88rem', color: '#71717A', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                <strong>Dirección:</strong> Carrera 15 # 85-30, Zona Rosa, Bogotá DC.
              </p>
              <p style={{ fontSize: '0.88rem', color: '#71717A', lineHeight: 1.6 }}>
                <strong>Horario de Atención:</strong> Lunes a Sábado: 10:00 AM – 7:00 PM.
              </p>
            </div>
          </div>
        )}

        {/* 8. TÉRMINOS Y CONDICIONES / PRIVACIDAD */}
        {(viewType === 'terminos' || viewType === 'privacidad') && (
          <div>
            <div style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#D4AF37', marginBottom: '0.3rem' }}>
                <Lock size={22} />
                <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>NORMATIVA LEGAL</span>
              </div>
              <h1 style={{ fontSize: '2.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>
                {viewType === 'terminos' ? 'TÉRMINOS Y CONDICIONES' : 'POLÍTICA DE PRIVACIDAD'}
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#71717A', marginTop: '0.5rem' }}>
                Marco regulatorio de uso de la plataforma e-commerce de J&M Fashion Store.
              </p>
            </div>

            <div style={{ fontSize: '0.88rem', color: '#71717A', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <p>
                Al acceder y realizar transacciones en la plataforma digital de J&M Fashion Store en Colombia, el usuario acepta de manera íntegra los términos de compra, tratamiento de datos personales conforme a la Ley 1581 de 2012 y condiciones de servicio vigentes.
              </p>
              <p>
                Todos los derechos de propiedad intelectual, marca comercial y fotografías exhibidas pertenecen a J&M Fashion Store.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default InfoPage;
