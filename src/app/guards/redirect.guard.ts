import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

/**
 * Guard que redirige a la ruta correcta según el rol del usuario
 * - Admin → /dashboard
 * - Vendedor → /ventas
 * - Sin sesión → /login
 */
export const redirectGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);

  try {
    const userRole = await supabase.getCurrentUserRole();
    

    if (userRole === 'admin') {
      
      router.navigate(['/dashboard'], { replaceUrl: true });
      return false;
    }

    if (userRole === 'vendedor') {
    
      router.navigate(['/ventas'], { replaceUrl: true });
      return false;
    }

    // Sin rol válido → login
    
    router.navigate(['/login'], { replaceUrl: true });
    return false;
    
  } catch (error) {
    
    router.navigate(['/login'], { replaceUrl: true });
    return false;
  }
};