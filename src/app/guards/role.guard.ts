import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

export const roleGuard: CanActivateFn = async (route, state) => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  try {
    const { data, error } = await supabase.getClient().auth.getSession();

    if (error) {
      console.error('Error checking auth session:', error);
      router.navigate(['/login']);
      return false;
    }

    const session = data.session;

    if (!session || !session.user) {
      router.navigate(['/login']);
      return false;
    }

    // Obtener el rol del usuario
    const userRole = await supabase.getCurrentUserRole();

    // Si es vendedor, solo puede acceder a /ventas
    if (userRole === 'vendedor') {
      const currentPath = state.url;
      if (currentPath !== '/ventas') {
        router.navigate(['/ventas']);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Unexpected error in role guard:', error);
    router.navigate(['/login']);
    return false;
  }
};