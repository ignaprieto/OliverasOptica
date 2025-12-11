import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

const RUTA_A_VISTA: { [key: string]: string } = {
  '/dashboard': 'dashboard',
  '/ventas': 'ventas',
  '/productos': 'productos',
  '/stock': 'stock',
  '/descuentos': 'descuentos',
  '/finanzas': 'finanzas',
  '/clientes': 'clientes',
  '/aumento': 'aumento',
  '/historial': 'historial',
  '/deposito': 'deposito',
  '/caja': 'caja',
  '/empleados': 'empleados',
  '/configuracion': 'configuracion'
};

export const roleGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);

  const role = await supabase.getCurrentUserRole();

  // 1. Admin pasa siempre
  if (role === 'admin') {
    return true;
  }

  // 2. Vendedor: Validar permiso específico
  if (role === 'vendedor') {
    const urlBase = state.url.split('?')[0].split('/')[1]; // ej: 'ventas'
    const vistaRequerida = RUTA_A_VISTA[`/${urlBase}`] || urlBase;

    // Si tiene permiso, pasa
    if (await supabase.puedeVerVista(vistaRequerida)) {
      return true;
    }
    
    // Si NO tiene permiso, redirigir a su home
    const home = await supabase.getPrimeraVistaAccesible();
    if (home) {
      router.navigate([`/${home}`]);
    } else {
      router.navigate(['/login']);
    }
    return false;
  }

  // 3. Guest o error
  router.navigate(['/login']);
  return false;
};