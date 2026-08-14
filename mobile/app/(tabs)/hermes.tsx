// =====================================================================
// Hermes como pestaña de abajo
// ---------------------------------------------------------------------
// La pantalla vive en app/hermes/index.tsx y se abre a pantalla completa
// desde "Más". Pero la barra de abajo la pinta expo-router a partir de los
// archivos de ESTE grupo: una pestaña solo puede apuntar a una ruta que
// exista aquí dentro. Sin este archivo, fijar a Hermes guardaba la
// preferencia y la barra no cambiaba.
//
// Se reexporta en vez de copiarse. Dos copias de una pantalla de chat es
// garantía de que un arreglo entre por una y no por la otra.
// =====================================================================
export { default } from '../hermes/index';
