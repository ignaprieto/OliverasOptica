import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);

  try {
    // Verificar si hay sesión de Supabase (admin)
    const { data } = await supabase.getClient().auth.getSession();
    const session = data.session;

    if (session && session.user) {
      
      return true;
    }

    // Verificar si hay sesión de vendedor en localStorage
    const vendedor = localStorage.getItem('user');
    if (vendedor) {
      
      return true;
    }

    // No hay ninguna sesión válida
    
    router.navigate(['/login']);
    return false;
    
  } catch (error) {
    console.error('Error en auth guard:', error);
    router.navigate(['/login']);
    return false;
  }
};