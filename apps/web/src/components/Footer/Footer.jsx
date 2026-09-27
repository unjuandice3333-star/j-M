import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, MapPin, Phone, Mail, ShieldCheck, Truck, RefreshCw, CreditCard } from 'lucide-react';

export const Footer = () => {
  return (
    <footer style={{ backgroundColor: '#09090B', color: '#FFFFFF', paddingTop: '4rem', paddingBottom: '2.5rem', borderTop: '1px solid #1F1F23' }}>
      <div className="jm-container">
        
        {/* BRAND IDENTITY HEADER */}
        <div style={{ marginBottom: '3.5rem', borderBottom: '1px solid #1F1F23', paddingBottom: '2.5rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '0.08em', color: '#FFFFFF', textTransform: 'uppercase' }}>
            J&M <span style={{ color: '#D4AF37', fontWeight: 400 }}>FASHION STORE</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#A1A1AA', marginTop: '0.4rem', fontWeight: 400, letterSpacing: '0.02em' }}>
            Estilo masculino para cada momento.
          </p>
        </div>

        {/* BRAND PROPOSITION BADGES */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '2rem',
          paddingBottom: '3.5rem',
          borderBottom: '1px solid #1F1F23',
          marginBottom: '3.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Truck size={28} color="#D4AF37" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF' }}>Envíos Nacionales</div>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>Gratis desde $200.000 a toda Colombia</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <RefreshCw size={28} color="#D4AF37" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF' }}>Cambios sin Complicaciones</div>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>Hasta 30 días para solicitar tu cambio</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <ShieldCheck size={28} color="#D4AF37" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF' }}>Calidad 100% Colombiana</div>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>Textiles premium y confección impecable</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <CreditCard size={28} color="#D4AF37" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF' }}>Pagos Seguros</div>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>PSE, Tarjetas, Nequi, Bancolombia</div>
            </div>
          </div>
        </div>

        {/* FOOTER NAVIGATION COLUMNS */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '2.5rem',
          marginBottom: '3.5rem'
        }}>
          {/* Column 1: COMPRAR */}
          <div>
            <h4 style={columnTitleStyle}>COMPRAR</h4>
            <ul style={ulStyle}>
              <li><Link to="/ropa" style={linkStyle}>Ropa</Link></li>
              <li><Link to="/calzado" style={linkStyle}>Calzado</Link></li>
              <li><Link to="/accesorios" style={linkStyle}>Accesorios</Link></li>
              <li><Link to="/ofertas" style={{ ...linkStyle, color: '#E11D48', fontWeight: 700 }}>Ofertas</Link></li>
              <li><Link to="/nuevo" style={linkStyle}>Novedades</Link></li>
            </ul>
          </div>

          {/* Column 2: AYUDA */}
          <div>
            <h4 style={columnTitleStyle}>AYUDA</h4>
            <ul style={ulStyle}>
              <li><Link to="/guia-de-tallas" style={linkStyle}>Guía de tallas</Link></li>
              <li><Link to="/envios" style={linkStyle}>Envíos</Link></li>
              <li><Link to="/cambios-y-devoluciones" style={linkStyle}>Cambios y devoluciones</Link></li>
              <li><Link to="/preguntas-frecuentes" style={linkStyle}>Preguntas frecuentes</Link></li>
              <li><Link to="/contacto" style={linkStyle}>Contacto</Link></li>
            </ul>
          </div>

          {/* Column 3: J&M */}
          <div>
            <h4 style={columnTitleStyle}>J&M</h4>
            <ul style={ulStyle}>
              <li><Link to="/nosotros" style={linkStyle}>Sobre nosotros</Link></li>
              <li><Link to="/tiendas" style={linkStyle}>Tiendas</Link></li>
              <li><a href="https://instagram.com" target="_blank" rel="noreferrer" style={linkStyle}>Instagram</a></li>
              <li><a href="https://wa.me/573000000000" target="_blank" rel="noreferrer" style={linkStyle}>WhatsApp</a></li>
            </ul>
          </div>

          {/* Column 4: LEGAL */}
          <div>
            <h4 style={columnTitleStyle}>LEGAL</h4>
            <ul style={ulStyle}>
              <li><Link to="/terminos" style={linkStyle}>Términos y condiciones</Link></li>
              <li><Link to="/privacidad" style={linkStyle}>Política de privacidad</Link></li>
              <li><Link to="/politica-de-cambios" style={linkStyle}>Política de cambios</Link></li>
            </ul>
          </div>
        </div>

        {/* LÍNEA DIVISORIA SUTIL Y PARTE INFERIOR DEL FOOTER */}
        <div style={{
          borderTop: '1px solid #1F1F23',
          paddingTop: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          fontSize: '0.80rem',
          color: '#71717A'
        }}>
          <div>
            © 2026 J&M Fashion Store. Todos los derechos reservados.
          </div>

          <div style={{ display: 'flex', gap: '1.25rem' }}>
            <Link to="/terminos" style={{ color: '#71717A', transition: 'color 0.15s' }}>Términos y condiciones</Link>
            <span>|</span>
            <Link to="/privacidad" style={{ color: '#71717A', transition: 'color 0.15s' }}>Privacidad</Link>
            <span>|</span>
            <Link to="/politica-de-cambios" style={{ color: '#71717A', transition: 'color 0.15s' }}>Cambios y devoluciones</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

const columnTitleStyle = {
  fontSize: '0.82rem',
  fontWeight: 800,
  letterSpacing: '0.12em',
  color: '#FFFFFF',
  marginBottom: '1.2rem',
  textTransform: 'uppercase'
};

const ulStyle = {
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem'
};

const linkStyle = {
  fontSize: '0.85rem',
  color: '#A1A1AA',
  transition: 'color 0.15s'
};

const socialIconStyle = {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  backgroundColor: '#18181B',
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s'
};

export default Footer;
