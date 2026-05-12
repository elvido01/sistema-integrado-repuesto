import { Linking, Alert } from 'react-native';

interface ShareToWhatsAppProps {
  phone?: string;
  message: string;
}

export const shareToWhatsApp = async ({ phone, message }: ShareToWhatsAppProps) => {
  let url = 'whatsapp://send?text=' + encodeURIComponent(message);
  
  if (phone) {
    // Limpiar el número (quitar espacios, guiones, paréntesis)
    let cleanPhone = phone.replace(/\D/g, '');
    
    // Si tiene 10 dígitos, asumir RD y agregar el 1
    if (cleanPhone.length === 10) {
      cleanPhone = '1' + cleanPhone;
    }
    
    url = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
  }

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert(
        'WhatsApp no instalado',
        'Al parecer no tienes WhatsApp instalado en este dispositivo.'
      );
    }
  } catch (error) {
    Alert.alert('Error', 'No se pudo abrir WhatsApp');
    console.error('Error al abrir WhatsApp', error);
  }
};
