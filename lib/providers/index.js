import demo from './demo.js';
import mercadolivre from './mercadolivre.js';
import pageurl from './pageurl.js';

export const providers = { demo, mercadolivre, pageurl };
export const searchable = () => Object.values(providers).filter((p) => p.searchable !== false);
