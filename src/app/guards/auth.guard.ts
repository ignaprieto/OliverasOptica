import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = async (route, state) => {
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

    return true;
  } catch (error) {
    console.error('Unexpected error in auth guard:', error);
    router.navigate(['/login']);
    return false;
  }
};