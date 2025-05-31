import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent {
  mostrarMenu = false;

  constructor(private router: Router, private supabase: SupabaseService) {}

  toggleMenu() {
    this.mostrarMenu = !this.mostrarMenu;
  }

  async cerrarSesion() {
    await this.supabase.getClient().auth.signOut();
    this.router.navigate(['/login']);
  }

}
