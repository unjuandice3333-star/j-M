// Capa Repository / Service para Productos e Inventario (Supabase PostgreSQL + Fallback local)
// J&M FASHION STORE — Moda Masculina Colombia

import supabase from '../config/supabase';
import { PRODUCTS } from '../data/mockData';
import { normalizeStyleLine } from '../utils/productUtils';

/**
 * Mapea y normaliza un registro retornado por PostgreSQL (con sus Joins)
 * a la estructura canónica consumida por los componentes de React del storefront.
 */
export const normalizeProductFromDB = (dbProd) => {
  if (!dbProd) return null;

  // Extraer imágenes desde variantes si existen o usar fallback
  const variantImages = Array.isArray(dbProd.variants)
    ? dbProd.variants.map((v) => v.image_url).filter((img) => typeof img === 'string' && img.trim() !== '')
    : [];

  const images = variantImages.length > 0 ? variantImages : (dbProd.images || []);

  // Mapeo defensivo para parsear atributos desde SKU si los joins de sizes/colors están protegidos por RLS
  const parseSkuInfo = (sku) => {
    if (!sku || typeof sku !== 'string') return { size: null, color: null };
    const parts = sku.split('-');
    const size = parts[parts.length - 2] || null;
    const colorCode = parts[parts.length - 1] || null;
    const colorNames = {
      'BEI': 'Beige Lino',
      'BLA': 'Blanco Crudo',
      'GRI': 'Gris Oxford',
      'NEG': 'Negro Premium'
    };
    return {
      size: size && ['S', 'M', 'L', 'XL', 'XXL', '30', '32', '34'].includes(size.toUpperCase()) ? size.toUpperCase() : null,
      color: colorCode ? (colorNames[colorCode.toUpperCase()] || colorCode) : null
    };
  };

  // Extraer tallas
  const variantSizes = Array.isArray(dbProd.variants)
    ? Array.from(new Set(dbProd.variants.map((v) => v.sizes?.code || parseSkuInfo(v.sku).size).filter(Boolean)))
    : [];
  const sizes = variantSizes.length > 0 ? variantSizes : ['S', 'M', 'L', 'XL'];

  // Extraer colores
  const variantColors = Array.isArray(dbProd.variants)
    ? dbProd.variants
        .map((v) => {
          if (v.colors?.name) return { name: v.colors.name, hex: v.colors.hex_code || '#121212' };
          const parsed = parseSkuInfo(v.sku);
          if (parsed.color) {
            const hex = parsed.color.includes('Beige') ? '#E2D3C4' : parsed.color.includes('Blanco') ? '#F9F6EE' : parsed.color.includes('Gris') ? '#353839' : '#000000';
            return { name: parsed.color, hex };
          }
          return null;
        })
        .filter(Boolean)
    : [];
  const colors = variantColors.length > 0
    ? Array.from(new Map(variantColors.map((c) => [c.name, c])).values())
    : [{ name: 'Negro Premium', hex: '#000000', selected: true }];

  const styleLineSlug = dbProd.style_lines?.slug
    ? normalizeStyleLine(dbProd.style_lines.slug)
    : 'urbana';

  const rawVariants = Array.isArray(dbProd.variants)
    ? dbProd.variants.map((v) => {
        const parsed = parseSkuInfo(v.sku);
        return {
          id: v.id,
          sku: v.sku,
          priceOverride: v.price_override,
          imageUrl: v.image_url,
          size: v.sizes?.code || parsed.size,
          color: v.colors?.name || parsed.color
        };
      })
    : [];

  const canonicalSlug = dbProd.slug || (dbProd.name ? dbProd.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : null) || dbProd.reference?.toLowerCase() || dbProd.id;

  return {
    id: dbProd.id,
    reference: dbProd.reference || dbProd.slug,
    name: dbProd.name || 'Prenda J&M',
    slug: canonicalSlug,
    category: dbProd.categories?.name?.toLowerCase() || dbProd.category || 'camisetas',
    categoryName: dbProd.categories?.name || 'Camisetas',
    brand: dbProd.brands?.name || 'J&M Fashion',
    styleLine: styleLineSlug,
    price: Number(dbProd.base_price || dbProd.price || 129900),
    originalPrice: dbProd.original_price ? Number(dbProd.original_price) : null,
    discountPercent: dbProd.discount_percent || 0,
    isNew: dbProd.is_new !== undefined ? dbProd.is_new : true,
    isBestSeller: dbProd.is_bestseller !== undefined ? dbProd.is_bestseller : false,
    isSale: dbProd.is_sale !== undefined ? dbProd.is_sale : false,
    rating: Number(dbProd.rating || 4.9),
    reviewCount: Number(dbProd.review_count || 12),
    fit: dbProd.fit || 'REGULAR',
    occasion: dbProd.occasion || 'casual',
    color: colors[0]?.name || 'Negro Premium',
    colors,
    sizes,
    rawVariants,
    images: images.length > 0 ? images : ['https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=1000'],
    description: dbProd.description || 'Prenda masculina de diseño exclusivo de la firma J&M Fashion Store.',
    details: dbProd.details || ['100% Algodón Colombiano', 'Confección Nacional Premium'],
    fitDescription: dbProd.fit_description || 'Horma anatómica de caída impecable.',
    status: dbProd.status || (dbProd.deleted_at ? 'archivado' : 'activo')
  };
};

export const productService = {
  // 1. Obtener todos los productos activos de la base de datos PostgreSQL
  getProducts: async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          reference,
          name,
          description,
          base_price,
          base_cost,
          deleted_at,
          categories(id, name),
          brands(id, name),
          variants(
            id,
            sku,
            price_override,
            image_url,
            sizes(code),
            colors(name, hex_code)
          )
        `)
        .is('deleted_at', null);

      if (error) {
        console.error('[ProductService Exception]: Error al consultar Supabase:', error.message);
        throw error;
      }

      // Si la consulta fue exitosa pero retorne 0 registros en DB, retornar array vacío autentico
      if (!data || data.length === 0) {
        console.warn('[ProductService Warning]: La tabla products en Supabase respondió exitosamente con 0 registros.');
        return [];
      }

      return data.map(normalizeProductFromDB);
    } catch (e) {
      console.warn('[ProductService Fallback]: Ocurrió una falla de red/conexion a Supabase. Activando fallback de emergencia local.', e);
      // Fallback de emergencia solo si ocurre un error real de red/desconexión
      return PRODUCTS;
    }
  },

  // 2. Obtener producto por ID
  getProductById: async (id) => {
    const products = await productService.getProducts();
    return products.find((p) => p.id === id) || null;
  },

  // 3. Obtener detalle de producto por Slug o Referencia
  getProductBySlug: async (slug) => {
    const products = await productService.getProducts();
    const found = products.find((p) => p.slug === slug || p.reference === slug || p.id === slug);
    return found || products[0] || PRODUCTS[0];
  },

  // 4. Obtener productos filtrados por Línea de Estilo
  getProductsByStyleLine: async (styleLineSlug) => {
    const products = await productService.getProducts();
    const canonical = normalizeStyleLine(styleLineSlug);
    if (canonical === 'todas') return products;
    return products.filter((p) => normalizeStyleLine(p.styleLine) === canonical);
  },

  // 5. Obtener productos filtrados por Categoría
  getProductsByCategory: async (categorySlug) => {
    const products = await productService.getProducts();
    if (!categorySlug || categorySlug === 'todas') return products;
    return products.filter((p) => p.category === categorySlug.toLowerCase());
  },

  // 6. Búsqueda y Filtrado Multi-Criterio (Intersección AND)
  searchProducts: async (filters = {}) => {
    const products = await productService.getProducts();
    return products.filter((p) => {
      if (p.status === 'borrador' || p.status === 'archivado') return false;
      if (filters.styleLine && filters.styleLine !== 'todas') {
        if (normalizeStyleLine(p.styleLine) !== normalizeStyleLine(filters.styleLine)) return false;
      }
      if (filters.category && filters.category !== 'todas') {
        if (p.category !== filters.category.toLowerCase()) return false;
      }
      if (filters.fit && filters.fit !== 'todos') {
        if (p.fit !== filters.fit) return false;
      }
      if (filters.size && filters.size !== 'todas') {
        if (!p.sizes?.includes(filters.size)) return false;
      }
      if (filters.maxPrice && p.price > filters.maxPrice) {
        return false;
      }
      return true;
    });
  },

  // 7. Obtener lista de categorías reales desde PostgreSQL
  getCategories: async () => {
    try {
      const { data, error } = await supabase.from('categories').select('id, name');
      if (error || !data) return [];
      return data;
    } catch (e) {
      console.error('[ProductService Error]: Error al obtener categorías de PostgreSQL:', e);
      return [];
    }
  },

  // 8. Obtener lista de marcas reales desde PostgreSQL
  getBrands: async () => {
    try {
      const { data, error } = await supabase.from('brands').select('id, name');
      if (error || !data) return [];
      return data;
    } catch (e) {
      console.error('[ProductService Error]: Error al obtener marcas de PostgreSQL:', e);
      return [];
    }
  },

  // 9. Crear un nuevo producto en Supabase PostgreSQL (CRUD Real)
  createProduct: async (productData) => {
    try {
      // Resolver style_line_id
      const styleCanonical = normalizeStyleLine(productData.styleLine || 'urbana');
      const { data: styleLineRecord } = await supabase
        .from('style_lines')
        .select('id')
        .eq('slug', styleCanonical)
        .single();
      
      const styleLineId = styleLineRecord?.id || 's1000000-0000-0000-0000-000000000001';

      // Resolver category_id por nombre/slug
      const { data: categoryRecord } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', `%${productData.category || 'camisetas'}%`)
        .limit(1)
        .single();

      const categoryId = categoryRecord?.id || 'c1000000-0000-0000-0000-000000000001';

      // Resolver brand_id
      const { data: brandRecord } = await supabase
        .from('brands')
        .select('id')
        .limit(1)
        .single();

      const brandId = brandRecord?.id || 'a1000000-0000-0000-0000-000000000001';

      const reference = productData.slug || (productData.name || 'prenda-nueva').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

      // Insertar producto máster
      const { data: newProd, error: insertError } = await supabase
        .from('products')
        .insert([{
          reference: `${reference}-${Math.floor(Math.random() * 1000)}`,
          name: productData.name,
          description: productData.description || '',
          category_id: categoryId,
          brand_id: brandId,
          style_line_id: styleLineId,
          base_price: Number(productData.price) || 129900,
          base_cost: Number(productData.cost) || 45000
        }])
        .select()
        .single();

      if (insertError) {
        console.error('[ProductService Error]: Error al crear producto en Supabase:', insertError);
        throw insertError;
      }

      // Re-consultar producto creado normalizado
      return await productService.getProductById(newProd.id);
    } catch (e) {
      console.error('[ProductService Exception]: Falla al crear producto en PostgreSQL:', e);
      throw e;
    }
  },

  // 10. Actualizar producto existente en Supabase PostgreSQL
  updateProduct: async (id, updatedFields) => {
    try {
      const updateData = {};

      if (updatedFields.name) updateData.name = updatedFields.name;
      if (updatedFields.description) updateData.description = updatedFields.description;
      if (updatedFields.price) updateData.base_price = Number(updatedFields.price);
      if (updatedFields.cost) updateData.base_cost = Number(updatedFields.cost);
      updateData.updated_at = new Date().toISOString();

      if (updatedFields.styleLine) {
        const styleCanonical = normalizeStyleLine(updatedFields.styleLine);
        const { data: styleRecord } = await supabase
          .from('style_lines')
          .select('id')
          .eq('slug', styleCanonical)
          .single();
        if (styleRecord) updateData.style_line_id = styleRecord.id;
      }

      const { data, error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[ProductService Error]: Error al actualizar producto en Supabase:', error);
        throw error;
      }

      return await productService.getProductById(id);
    } catch (e) {
      console.error('[ProductService Exception]: Falla al actualizar producto en PostgreSQL:', e);
      throw e;
    }
  },

  // 11. Eliminar producto de Supabase PostgreSQL (Soft Delete seguro para preservar pedidos e historial)
  deleteProduct: async (id) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error('[ProductService Error]: Error al eliminar producto en Supabase:', error);
        throw error;
      }

      return true;
    } catch (e) {
      console.error('[ProductService Exception]: Falla al eliminar producto en PostgreSQL:', e);
      throw e;
    }
  }
};

export default productService;
