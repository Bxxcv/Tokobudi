/**
 * LINKify — Premium Templates System (templates.js)
 * 6 Tema Premium dengan styling unik dan optimasi performa
 * Used by: index.html, admin.html untuk preview dan pemilihan template
 */

export const PREMIUM_TEMPLATES = {
  // ═══════════════════════════════════════════════════════════════════════════
  // TEMA 1: FASHION & CLOTHING (Modern Minimalis)
  // ═══════════════════════════════════════════════════════════════════════════
  fashion: {
    id: 'fashion',
    name: 'Fashion & Clothing',
    category: 'Fashion',
    description: 'Template modern untuk butik fashion dan clothing',
    icon: '👔',
    premium: true,
    config: {
      fonts: {
        heading: '"Playfair Display", serif',
        body: '"Inter", sans-serif'
      },
      colors: {
        primary: '#1a1a1a',
        secondary: '#d4af37',
        accent: '#f5f5f5',
        background: '#fafafa',
        text: '#1a1a1a',
        textLight: '#666666',
        border: '#e0e0e0'
      },
      styles: {
        heroHeight: '480px',
        cardRadius: '2px',
        shadowType: 'subtle',
        heroOverlay: true,
        overlayOpacity: 0.3,
        buttonStyle: 'elegant',
        animationSpeed: 'slow'
      }
    },
    cssVariables: `
      --theme-primary: #1a1a1a;
      --theme-secondary: #d4af37;
      --theme-accent: #f5f5f5;
      --theme-bg: #fafafa;
      --theme-text: #1a1a1a;
      --theme-text-light: #666666;
      --theme-border: #e0e0e0;
      --theme-font-heading: "Playfair Display", serif;
      --theme-font-body: "Inter", sans-serif;
      --theme-card-radius: 2px;
      --theme-shadow: 0 2px 8px rgba(0,0,0,0.08);
      --theme-transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    `,
    features: ['Elegant styling', 'Sepia tones', 'Minimalist design', 'Premium feel']
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMA 2: KULINER & UMKM MAKANAN (Warm & Appetizing)
  // ═══════════════════════════════════════════════════════════════════════════
  kuliner: {
    id: 'kuliner',
    name: 'Kuliner & UMKM Makanan',
    category: 'Food',
    description: 'Template hangat untuk bisnis kuliner dan UMKM makanan',
    icon: '🍽️',
    premium: true,
    config: {
      fonts: {
        heading: '"Fredoka", sans-serif',
        body: '"Poppins", sans-serif'
      },
      colors: {
        primary: '#d2691e',
        secondary: '#ff8c42',
        accent: '#fff4e6',
        background: '#fffaf5',
        text: '#2d2416',
        textLight: '#7d6b5b',
        border: '#f5e6d3'
      },
      styles: {
        heroHeight: '400px',
        cardRadius: '16px',
        shadowType: 'warm',
        heroOverlay: false,
        buttonStyle: 'rounded',
        animationSpeed: 'medium'
      }
    },
    cssVariables: `
      --theme-primary: #d2691e;
      --theme-secondary: #ff8c42;
      --theme-accent: #fff4e6;
      --theme-bg: #fffaf5;
      --theme-text: #2d2416;
      --theme-text-light: #7d6b5b;
      --theme-border: #f5e6d3;
      --theme-font-heading: "Fredoka", sans-serif;
      --theme-font-body: "Poppins", sans-serif;
      --theme-card-radius: 16px;
      --theme-shadow: 0 4px 12px rgba(210, 105, 30, 0.15);
      --theme-transition: 0.3s ease;
    `,
    features: ['Warm colors', 'Appetizing design', 'Food-friendly', 'Cozy aesthetic']
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMA 3: KECANTIKAN & SKINCARE (Luxurious Glow)
  // ═══════════════════════════════════════════════════════════════════════════
  kecantikan: {
    id: 'kecantikan',
    name: 'Kecantikan & Skincare',
    category: 'Beauty',
    description: 'Template mewah untuk bisnis kecantikan dan skincare',
    icon: '💄',
    premium: true,
    config: {
      fonts: {
        heading: '"Montserrat", sans-serif',
        body: '"Lato", sans-serif'
      },
      colors: {
        primary: '#c084b8',
        secondary: '#f0a8d8',
        accent: '#fdf8ff',
        background: '#fdf5fb',
        text: '#3a2f4a',
        textLight: '#8b7a99',
        border: '#f0e6f6'
      },
      styles: {
        heroHeight: '420px',
        cardRadius: '20px',
        shadowType: 'glow',
        heroOverlay: true,
        overlayOpacity: 0.2,
        buttonStyle: 'gradient',
        animationSpeed: 'medium'
      }
    },
    cssVariables: `
      --theme-primary: #c084b8;
      --theme-secondary: #f0a8d8;
      --theme-accent: #fdf8ff;
      --theme-bg: #fdf5fb;
      --theme-text: #3a2f4a;
      --theme-text-light: #8b7a99;
      --theme-border: #f0e6f6;
      --theme-font-heading: "Montserrat", sans-serif;
      --theme-font-body: "Lato", sans-serif;
      --theme-card-radius: 20px;
      --theme-shadow: 0 8px 24px rgba(192, 132, 184, 0.12);
      --theme-glow: 0 0 20px rgba(240, 168, 216, 0.3);
      --theme-transition: 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    `,
    features: ['Luxurious feel', 'Gradient accents', 'Premium glow', 'Beauty-focused']
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMA 4: ELEKTRONIK & GADGET (Tech-Forward)
  // ═══════════════════════════════════════════════════════════════════════════
  elektronik: {
    id: 'elektronik',
    name: 'Elektronik & Gadget',
    category: 'Tech',
    description: 'Template modern untuk toko elektronik dan gadget',
    icon: '📱',
    premium: true,
    config: {
      fonts: {
        heading: '"Space Mono", monospace',
        body: '"Roboto", sans-serif'
      },
      colors: {
        primary: '#1a1f3a',
        secondary: '#00d4ff',
        accent: '#0f1423',
        background: '#0a0e1a',
        text: '#e5e9f2',
        textLight: '#a8b2c1',
        border: '#1e2749'
      },
      styles: {
        heroHeight: '500px',
        cardRadius: '12px',
        shadowType: 'neon',
        heroOverlay: true,
        overlayOpacity: 0.4,
        buttonStyle: 'neon',
        animationSpeed: 'fast'
      }
    },
    cssVariables: `
      --theme-primary: #1a1f3a;
      --theme-secondary: #00d4ff;
      --theme-accent: #0f1423;
      --theme-bg: #0a0e1a;
      --theme-text: #e5e9f2;
      --theme-text-light: #a8b2c1;
      --theme-border: #1e2749;
      --theme-font-heading: "Space Mono", monospace;
      --theme-font-body: "Roboto", sans-serif;
      --theme-card-radius: 12px;
      --theme-shadow: 0 0 15px rgba(0, 212, 255, 0.1);
      --theme-neon: 0 0 10px rgba(0, 212, 255, 0.5);
      --theme-transition: 0.2s linear;
    `,
    features: ['Dark mode tech', 'Neon accents', 'Modern feel', 'High contrast']
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMA 5: KREATOR & FREELANCER (Creative Vibes)
  // ═══════════════════════════════════════════════════════════════════════════
  kreator: {
    id: 'kreator',
    name: 'Kreator & Freelancer',
    category: 'Creative',
    description: 'Template kreatif untuk para kreator dan freelancer',
    icon: '🎨',
    premium: true,
    config: {
      fonts: {
        heading: '"Poppins", sans-serif',
        body: '"Inter", sans-serif'
      },
      colors: {
        primary: '#6c5ce7',
        secondary: '#fd79a8',
        accent: '#fff8f3',
        background: '#faf9f6',
        text: '#2d3436',
        textLight: '#636e72',
        border: '#e9ecef'
      },
      styles: {
        heroHeight: '420px',
        cardRadius: '16px',
        shadowType: 'colorful',
        heroOverlay: false,
        buttonStyle: 'vibrant',
        animationSpeed: 'medium'
      }
    },
    cssVariables: `
      --theme-primary: #6c5ce7;
      --theme-secondary: #fd79a8;
      --theme-accent: #fff8f3;
      --theme-bg: #faf9f6;
      --theme-text: #2d3436;
      --theme-text-light: #636e72;
      --theme-border: #e9ecef;
      --theme-font-heading: "Poppins", sans-serif;
      --theme-font-body: "Inter", sans-serif;
      --theme-card-radius: 16px;
      --theme-shadow: 0 8px 20px rgba(108, 92, 231, 0.12);
      --theme-transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `,
    features: ['Vibrant colors', 'Creative energy', 'Modern look', 'Fun aesthetic']
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMA 6: RESELLER & DROPSHIPPER (Professional Commerce)
  // ═══════════════════════════════════════════════════════════════════════════
  reseller: {
    id: 'reseller',
    name: 'Reseller & Dropshipper',
    category: 'Commerce',
    description: 'Template profesional untuk reseller dan dropshipper',
    icon: '📦',
    premium: true,
    config: {
      fonts: {
        heading: '"Raleway", sans-serif',
        body: '"Open Sans", sans-serif'
      },
      colors: {
        primary: '#00a651',
        secondary: '#ffa500',
        accent: '#f0f9ff',
        background: '#f8f9fa',
        text: '#1b1b1b',
        textLight: '#5a5a5a',
        border: '#dfe4eb'
      },
      styles: {
        heroHeight: '380px',
        cardRadius: '8px',
        shadowType: 'professional',
        heroOverlay: false,
        buttonStyle: 'professional',
        animationSpeed: 'fast'
      }
    },
    cssVariables: `
      --theme-primary: #00a651;
      --theme-secondary: #ffa500;
      --theme-accent: #f0f9ff;
      --theme-bg: #f8f9fa;
      --theme-text: #1b1b1b;
      --theme-text-light: #5a5a5a;
      --theme-border: #dfe4eb;
      --theme-font-heading: "Raleway", sans-serif;
      --theme-font-body: "Open Sans", sans-serif;
      --theme-card-radius: 8px;
      --theme-shadow: 0 2px 8px rgba(0, 166, 81, 0.08);
      --theme-transition: 0.25s ease;
    `,
    features: ['Professional', 'Commerce-ready', 'Clean layout', 'Trust-building']
  }
};

/**
 * Dapatkan template berdasarkan ID
 */
export function getTemplate(templateId) {
  return PREMIUM_TEMPLATES[templateId] || PREMIUM_TEMPLATES.fashion;
}

/**
 * Dapatkan semua template
 */
export function getAllTemplates() {
  return Object.values(PREMIUM_TEMPLATES);
}

/**
 * Generate CSS untuk template tertentu dengan optimasi
 */
export function generateTemplateCSS(templateId) {
  const template = getTemplate(templateId);
  return template.cssVariables;
}

/**
 * Inject theme variables ke document
 */
export function applyTemplate(templateId) {
  const template = getTemplate(templateId);
  const root = document.documentElement;
  
  // Inject CSS variables dengan performance optimization
  const vars = template.config.colors;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(`--template-${key}`, value);
  });
  
  // Inject font families
  const fonts = template.config.fonts;
  root.style.setProperty('--template-heading-font', fonts.heading);
  root.style.setProperty('--template-body-font', fonts.body);
  
  // Apply style config
  const styles = template.config.styles;
  root.style.setProperty('--template-card-radius', styles.cardRadius);
  root.style.setProperty('--template-hero-height', styles.heroHeight);
  root.style.setProperty('--template-shadow-type', styles.shadowType);
  
  // Trigger reflow untuk rendering yang smooth
  document.body.classList.add(`template-${templateId}`);
}

/**
 * Hapus template styling dari document
 */
export function removeTemplate(templateId) {
  document.body.classList.remove(`template-${templateId}`);
}

/**
 * Get theme config untuk preview
 */
export function getThemePreviewData(templateId) {
  const template = getTemplate(templateId);
  return {
    name: template.name,
    category: template.category,
    colors: template.config.colors,
    fonts: template.config.fonts,
    features: template.features,
    icon: template.icon
  };
}

/**
 * Validasi apakah template valid untuk user (premium only)
 */
export function validateTemplateAccess(isPremium, templateId) {
  const template = getTemplate(templateId);
  if (template.premium && !isPremium) {
    return {
      valid: false,
      message: 'Template ini hanya tersedia untuk member Premium'
    };
  }
  return { valid: true };
}

export default PREMIUM_TEMPLATES;
