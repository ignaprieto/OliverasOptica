// footer.component.ts
import { Component, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <footer class="bg-gradient-to-r from-gray-800 to-gray-900 text-white py-6 mt-auto border-t border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
          <!-- Derechos reservados -->
          <div class="flex items-center gap-2 text-sm text-gray-300">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
            <span>© {{ currentYear }} - Todos los derechos reservados</span>
          </div>

          <!-- Desarrollado por -->
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-400">Desarrollado por</span>
            <div class="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
              </svg>
              <span class="font-bold text-white">Prisys Solutions</span>
            </div>
            
            <!-- Botón de Instagram -->
            <a 
              href="https://www.instagram.com/prisys.solutions/" 
              target="_blank" 
              rel="noopener noreferrer"
              class="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110 hover:rotate-3"
              aria-label="Instagram de Prisys Solutions"
            >
              <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    :host {
      display: block;
      position: relative;
      visibility: hidden;
    }

    :host(.footer-ready) {
      visibility: visible;
    }

    footer {
      opacity: 1;
      transform: translateY(0);
    }
  `]
})
export class FooterComponent implements AfterViewInit {
  currentYear = new Date().getFullYear();

  constructor(private elementRef: ElementRef) {}

  ngAfterViewInit() {
    // Esperar a que el DOM esté completamente renderizado
    setTimeout(() => {
      this.elementRef.nativeElement.classList.add('footer-ready');
    }, 150);
  }
}