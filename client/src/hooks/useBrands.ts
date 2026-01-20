import { useState, useEffect } from 'react';
import { fetchBrands } from '../services/api';

interface UseBrandsReturn {
  brands: string[];
  isLoading: boolean;
  error: string | null;
}

export function useBrands(): UseBrandsReturn {
  const [brands, setBrands] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadBrands() {
      setIsLoading(true);
      setError(null);

      const response = await fetchBrands();

      if (isMounted) {
        if (response.success) {
          setBrands(response.brands);
        } else {
          setError(response.error || 'Failed to load brands');
        }
        setIsLoading(false);
      }
    }

    loadBrands();

    return () => {
      isMounted = false;
    };
  }, []);

  return { brands, isLoading, error };
}
