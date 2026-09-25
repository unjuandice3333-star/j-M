import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, MapPin, Phone, Mail, ShieldCheck, Truck, RefreshCw, CreditCard } from 'lucide-react';

export const Footer = () => {
  return (
    <footer style={{ backgroundColor: '#09090B', color: '#FFFFFF', paddingTop: '4rem', paddingBottom: '2rem', borderTop: '1px solid #1F1F23' }}>
      <div className="jm-container">
        {/* BRAND PROPOSITION BADGES */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '2rem',
          paddingBottom: '3.5rem',
          borderBottom: '1px solid #27272A',
          marginBottom: '3.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Truck size={32} color="#D4AF37" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Envíos Nacionales</div>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>Gratis desde $200.000 a toda Colombia</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <RefreshCw size={32} color="#D4AF37" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Cambios sin Complicaciones</div>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>Hasta 30 días para solicitar tu cambio</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <ShieldCheck size={32} color="#D4AF37" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Calidad 100% Colombiana</div>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>Textiles premium y confección impecable</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <CreditCard size={32} color="#D4AF37" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Pagos Seguros</div>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>PSE, Tarjetas, Nequi, Bancolombia</div>
            </div>
          </div>
        </div>

        {/* FOOTER NAVIGATION COLUMNS */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '2.5rem',
          marginBottom: '3.5rem'
        }}>
          {/* Brand Info */}
          <div>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.3rem', fontWeight: 800, letterSpacing: '0.12em', display: 'block', marginBottom: '0.8rem' }}>
              J&M FASHION STORE
            </span>
            <p style={{ fontSize: '0.85rem', color: '#A1A1AA', lineHeight: 1.6, marginBottom: '1.2rem' }}>
              Marca líder de moda masculina en Colombia. Diseñamos prendas sofisticadas, modernas y atemporales para hombres que valoran su estilo.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <a href="https://instagram.com" target="_blank" rel="noreferrer" style={socialIconStyle}>
                <Instagram size={18} />
              </a>
              <a href="https://facebook.com" target="_blank" rel="noreferrer" style={socialIconStyle}>
                <Facebook size={18} />
              </a>
            </div>
          </div>

          {/* Shop Links */}
          <div>
            <h4 style={columnTitleStyle}>COMPRAR</h4>
            <ul style={ulStyle}>
              <li><Link to="/nuevo" style={linkStyle}>Novedades</Link></li>
              <li><Link to="/ropa/camisetas" style={linkStyle}>Camisetas</Link></li>
              <li><Link to="/ropa/camisas" style={linkStyle}>Camisas Oxford</Link></li>
              <li><Link to="/ropa/polos" style={linkStyle}>Polos Mercerizados</Link></li>
              <li><Link to="/ropa/jeans" style={linkStyle}>Jeans Selvedge</Link></li>
              <li><Link to="/ropa/pantalones" style={linkStyle}>Pantalones Chino</Link></li>
              <li><Link to="/calzado" style={linkStyle}>Calzado en Cuero</Link></li>
              <li><Link to="/ofertas" style={{ ...linkStyle, color: '#E11D48' }}>Ofertas Especiales</Link></li>
            </ul>
          </div>

          {/* Help Links */}
          <div>
            <h4 style={columnTitleStyle}>AYUDA & SOPORTE</h4>
            <ul style={ulStyle}>
              <li><Link to="/guia-de-tallas" style={linkStyle}>Guía de Tallas</Link></li>
              <li><Link to="/cambios-y-devoluciones" style={linkStyle}>Política de Cambios</Link></li>
              <li><Link to="/contacto" style={linkStyle}>Centro de Contacto</Link></li>
              <li><Link to="/nosotros" style={linkStyle}>Sobre J&M Store</Link></li>
              <li><a href="#tienda-fisica" style={linkStyle}>Tiendas Físicas</a></li>
            </ul>
          </div>

          {/* Store Info & Newsletter */}
          <div>
            <h4 style={columnTitleStyle}>ATENCIÓN AL CLIENTE</h4>
            <div style={{ fontSize: '0.85rem', color: '#A1A1AA', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin size={16} color="#D4AF37" /> Bogotá & Medellín, Colombia
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Phone size={16} color="#D4AF37" /> +57 (601) 300 0000
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mail size={16} color="#D4AF37" /> contacto@jmfashion.co
              </div>
            </div>
          </div>
        </div>

        {/* COPYRIGHT */}
        <div style={{
          borderTop: '1px solid #1F1F23',
          paddingTop: '2rem',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.78rem',
          color: '#71717A'
        }}>
          <div>
            © {new Date().getFullYear()} J&M FASHION STORE. Todos los derechos reservados. Colombia.
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <Link to="/terminos" style={{ color: '#71717A' }}>Términos y Condiciones</Link>
            <Link to="/privacidad" style={{ color: '#71717A' }}>Política de Privacidad</Link>
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
