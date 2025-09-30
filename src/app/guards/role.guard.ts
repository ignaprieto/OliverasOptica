import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

export const roleGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);

  try {
    const userRole = await supabase.getCurrentUserRole();
    

    // ADMIN: Acceso total a todas las rutas protegidas
    if (userRole === 'admin') {
      
      return true;
    }

    // VENDEDOR: Solo puede acceder a /ventas
    if (userRole === 'vendedor') {
      if (state.url === '/ventas' || state.url.startsWith('/ventas')) {
        
        return true;
      } else {
        
        router.navigate(['/ventas']);
        return false;
      }
    }

    // ROL DESCONOCIDO: Redirigir a login
    
    router.navigate(['/login']);
    return false;
    
  } catch (error) {
    console.error('Error en role guard:', error);
    router.navigate(['/login']);
    return false;
  }
};