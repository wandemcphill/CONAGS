import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Conags Care',
    short_name: 'Conags Care',
    description: 'Private CONAGS Care staff workspace',
    start_url: '/staff',
    display: 'standalone',
    background_color: '#f4f7fb',
    theme_color: '#102a43',
    orientation: 'portrait',
    categories: ['business', 'productivity'],
  };
}
