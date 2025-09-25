import { Component, OnInit, HostListener } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit {
  mostrarMenu = false;
  isVendedor = false;
  userName = '';

  constructor(private router: Router, private supabase: SupabaseService) {}

  async ngOnInit() {
    // Verificar si el usuario es vendedor para ocultar las opciones del menú
    this.isVendedor = await this.supabase.isUserVendedor();
    this.userName = await this.supabase.getCurrentUserName();
  }

  // Escuchar clicks en toda la ventana
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    const navbar = document.querySelector('nav');
    
    // Si el click no es dentro del navbar y el menú está abierto, cerrarlo
    if (navbar && !navbar.contains(target) && this.mostrarMenu) {
      this.mostrarMenu = false;
    }
  }

  // Escuchar tecla Escape para cerrar el menú
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    if (this.mostrarMenu) {
      this.mostrarMenu = false;
    }
  }

  toggleMenu() {
    this.mostrarMenu = !this.mostrarMenu;
  }

  // Cerrar menú al hacer click en un enlace
  closeMenu() {
    this.mostrarMenu = false;
  }

  async cerrarSesion() {
    try {
      await this.supabase.signOut();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      // Forzar navegación a login incluso si hay error
      this.router.navigate(['/login']);
    }
  }

  // Método helper para verificar si se debe mostrar una opción del menú
  shouldShowMenuItem(): boolean {
    return !this.isVendedor;
  }
}