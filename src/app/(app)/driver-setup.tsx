import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from 'react-native';
import tw from 'twrnc';
import { useAuth } from '../../hooks/useAuth';
import { supabase, uploadDriverAttachment } from '../../services/supabase';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

interface Organization {
  id: string;
  name: string;
}

interface InputFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

export default function DriverSetupScreen() {
  const { session, signOut } = useAuth();
  const [name, setName] = useState('');
  const [placa, setPlaca] = useState('');
  
  // States for organizations
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showOrgPicker, setShowOrgPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [propietario, setPropietario] = useState('');
  const [numeroAfiliacion, setNumeroAfiliacion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fetchingOrgs, setFetchingOrgs] = useState(true);

  // States for attachments
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [fotoVehiculo, setFotoVehiculo] = useState<string | null>(null);
  const [docLicencia, setDocLicencia] = useState<string | null>(null);
  const [docSoat, setDocSoat] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  useEffect(() => {
    supabase.from('organizations').select('id, name').order('name').then(({data, error}) => {
      setFetchingOrgs(false);
      if (data) {
        setOrganizations(data);
      } else {
        console.error("Error fetching orgs:", error);
      }
    });
  }, []);

  const pickImage = async (type: 'photo' | 'vehicle' | 'license' | 'soat') => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permiso Denegado', 'Se requiere acceso a la galería para subir archivos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'photo' ? [1, 1] : [4, 3],
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      if (type === 'photo') setFotoPerfil(uri);
      else if (type === 'vehicle') setFotoVehiculo(uri);
      else if (type === 'license') setDocLicencia(uri);
      else if (type === 'soat') setDocSoat(uri);
    }
  };

  const handleSave = async () => {
    if (!name || !placa || !selectedOrg) {
      Alert.alert('Datos incompletos', 'Por favor llena los campos obligatorios: Nombre, Placa y Sindicato.');
      return;
    }

    if (!session?.id) return;

    setIsLoading(true);
    setUploadStatus('Iniciando subida...');

    let uploadedFotoUrl = '';
    let uploadedFotoVehiculoUrl = '';
    let uploadedLicenseUrl = '';
    let uploadedSoatUrl = '';

    try {
      // 1. Subir Foto Perfil
      if (fotoPerfil) {
        setUploadStatus('Subiendo foto de perfil...');
        const { publicUrl, error } = await uploadDriverAttachment(session.id, 'photo', fotoPerfil);
        if (error) throw new Error('Error subiendo foto de perfil: ' + error.message);
        if (publicUrl) uploadedFotoUrl = publicUrl;
      }

      // 2. Subir Foto Vehículo
      if (fotoVehiculo) {
        setUploadStatus('Subiendo foto del vehículo...');
        const { publicUrl, error } = await uploadDriverAttachment(session.id, 'vehicle', fotoVehiculo);
        if (error) throw new Error('Error subiendo foto del vehículo: ' + error.message);
        if (publicUrl) uploadedFotoVehiculoUrl = publicUrl;
      }

      // 3. Subir Licencia
      if (docLicencia) {
        setUploadStatus('Subiendo foto de licencia...');
        const { publicUrl, error } = await uploadDriverAttachment(session.id, 'license', docLicencia);
        if (error) throw new Error('Error subiendo licencia: ' + error.message);
        if (publicUrl) uploadedLicenseUrl = publicUrl;
      }

      // 4. Subir SOAT
      if (docSoat) {
        setUploadStatus('Subiendo foto de SOAT...');
        const { publicUrl, error } = await uploadDriverAttachment(session.id, 'soat', docSoat);
        if (error) throw new Error('Error subiendo SOAT: ' + error.message);
        if (publicUrl) uploadedSoatUrl = publicUrl;
      }

      setUploadStatus('Guardando información...');

      const { error } = await supabase.from('drivers').upsert({
        id: session.id,
        phone: session.phone,
        name,
        placa,
        organization_id: selectedOrg.id,
        sindicato: selectedOrg.name, // Sincronizar campo de texto legado para visualización en DB
        propietario: propietario || name,
        numero_afiliacion: numeroAfiliacion,
        is_profile_complete: true,
        status: 'offline',
        foto_url: uploadedFotoUrl || undefined,
        foto_vehiculo_url: uploadedFotoVehiculoUrl || undefined,
        documentacion_urls: {
          license: uploadedLicenseUrl || undefined,
          soat: uploadedSoatUrl || undefined,
        }
      }, { onConflict: 'id' });

      if (error) throw error;
      
      router.replace('/(app)/driver');
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Hubo un problema guardando tu perfil.');
    } finally {
      setIsLoading(false);
      setUploadStatus('');
    }
  };

  const filteredOrgs = organizations.filter(o => o.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={tw`flex-1 bg-gray-50`}
    >
      <ScrollView contentContainerStyle={tw`flex-grow px-5 py-12 max-w-md mx-auto w-full`} keyboardShouldPersistTaps="handled">
        <View style={tw`items-center mb-8`}>
          <View style={tw`w-16 h-16 bg-blue-50 rounded-2xl items-center justify-center mb-4 border border-blue-100`}>
            <Text style={tw`text-2xl`}>📋</Text>
          </View>
          <Text style={tw`text-2xl font-black text-gray-900 text-center tracking-tight`}>
            Ficha del Vehículo
          </Text>
          <Text style={tw`text-gray-500 text-xs text-center mt-2 font-medium px-4 leading-relaxed`}>
            Completa tu registro para empezar a transmitir tu ubicación a la central de control de tu sindicato.
          </Text>
        </View>

        <View style={tw`bg-white p-6 rounded-2xl border border-gray-100 mb-6 shadow-sm`}>
          <InputField label="Nombre Completo *" placeholder="Ej. Roberto Mamani" value={name} onChangeText={setName} />
          <InputField label="Placa del Vehículo *" placeholder="Ej. 1234-ABC" value={placa} onChangeText={setPlaca} autoCapitalize="characters" />
          
          {/* Picker de Sindicato Integrado (Inline) */}
          <View style={tw`mb-4 relative z-50`}>
            <Text style={tw`text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1`}>Sindicato *</Text>
            <TouchableOpacity 
              style={tw`bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 flex-row justify-between items-center`}
              onPress={() => setShowOrgPicker(!showOrgPicker)}
              activeOpacity={0.7}
            >
              <Text style={tw`text-sm font-semibold ${selectedOrg ? 'text-gray-900' : 'text-gray-400'}`} numberOfLines={1}>
                {selectedOrg ? selectedOrg.name : (fetchingOrgs ? 'Cargando sindicatos...' : 'Selecciona tu Sindicato...')}
              </Text>
              <Text style={tw`text-gray-400 text-xs`}>{showOrgPicker ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {showOrgPicker && (
              <View style={tw`bg-white border border-gray-200 rounded-xl mt-2 max-h-64 shadow-lg absolute top-[65px] w-full z-50 overflow-hidden`}>
                <View style={tw`p-2 border-b border-gray-100 bg-gray-50`}>
                  <TextInput 
                    placeholder="Buscar sindicato..."
                    placeholderTextColor="#9ca3af"
                    style={tw`bg-white px-3 py-2 text-sm border border-gray-200 rounded-lg font-medium`}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>
                <ScrollView nestedScrollEnabled style={tw`max-h-48`} keyboardShouldPersistTaps="handled">
                  {filteredOrgs.map(org => (
                    <TouchableOpacity
                      key={org.id}
                      style={tw`px-4 py-3 border-b border-gray-50 hover:bg-gray-50`}
                      onPress={() => {
                        setSelectedOrg(org);
                        setShowOrgPicker(false);
                        setSearchQuery('');
                      }}
                    >
                      <Text style={tw`text-sm font-semibold text-gray-800`}>{org.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {filteredOrgs.length === 0 && (
                    <View style={tw`p-4 items-center`}>
                      <Text style={tw`text-gray-400 text-xs font-semibold`}>No se encontraron resultados</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}
          </View>

          <InputField label="Propietario (Opcional)" placeholder="Si eres tú, déjalo vacío" value={propietario} onChangeText={setPropietario} />
          <InputField label="Nº Afiliación (Opcional)" placeholder="Ej. 045-B" value={numeroAfiliacion} onChangeText={setNumeroAfiliacion} />
        </View>

        <View style={tw`bg-white p-6 rounded-2xl border border-gray-100 mb-6 shadow-sm`}>
          <Text style={tw`text-sm font-bold text-gray-800 mb-4`}>Documentación y Fotos</Text>
          
          {/* Foto Perfil */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1`}>Foto de Perfil *</Text>
            <View style={tw`flex-row items-center gap-4`}>
              <TouchableOpacity 
                style={tw`w-20 h-20 bg-gray-50 border border-dashed border-gray-300 rounded-2xl items-center justify-center overflow-hidden`}
                onPress={() => pickImage('photo')}
              >
                {fotoPerfil ? (
                  <Image source={{ uri: fotoPerfil }} style={tw`w-full h-full`} />
                ) : (
                  <Text style={tw`text-lg`}>👤</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickImage('photo')} style={tw`bg-gray-100 px-4 py-2 rounded-xl`}>
                <Text style={tw`text-xs font-bold text-gray-600`}>{fotoPerfil ? 'Cambiar Foto' : 'Subir Foto'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Foto Vehículo */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1`}>Foto del Vehículo</Text>
            <View style={tw`flex-row items-center gap-4`}>
              <TouchableOpacity 
                style={tw`w-20 h-20 bg-gray-50 border border-dashed border-gray-300 rounded-2xl items-center justify-center overflow-hidden`}
                onPress={() => pickImage('vehicle')}
              >
                {fotoVehiculo ? (
                  <Image source={{ uri: fotoVehiculo }} style={tw`w-full h-full`} />
                ) : (
                  <Text style={tw`text-lg`}>🚗</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickImage('vehicle')} style={tw`bg-gray-100 px-4 py-2 rounded-xl`}>
                <Text style={tw`text-xs font-bold text-gray-600`}>{fotoVehiculo ? 'Cambiar Foto' : 'Subir Foto'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Documentos */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1`}>Licencia de Conducir (Escaneada)</Text>
            <View style={tw`flex-row items-center gap-4`}>
              <TouchableOpacity 
                style={tw`w-20 h-20 bg-gray-50 border border-dashed border-gray-300 rounded-2xl items-center justify-center overflow-hidden`}
                onPress={() => pickImage('license')}
              >
                {docLicencia ? (
                  <Image source={{ uri: docLicencia }} style={tw`w-full h-full`} />
                ) : (
                  <Text style={tw`text-lg`}>🪪</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickImage('license')} style={tw`bg-gray-100 px-4 py-2 rounded-xl`}>
                <Text style={tw`text-xs font-bold text-gray-600`}>{docLicencia ? 'Cambiar Licencia' : 'Subir Licencia'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SOAT */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1`}>SOAT Vigente (Escaneado)</Text>
            <View style={tw`flex-row items-center gap-4`}>
              <TouchableOpacity 
                style={tw`w-20 h-20 bg-gray-50 border border-dashed border-gray-300 rounded-2xl items-center justify-center overflow-hidden`}
                onPress={() => pickImage('soat')}
              >
                {docSoat ? (
                  <Image source={{ uri: docSoat }} style={tw`w-full h-full`} />
                ) : (
                  <Text style={tw`text-lg`}>📄</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickImage('soat')} style={tw`bg-gray-100 px-4 py-2 rounded-xl`}>
                <Text style={tw`text-xs font-bold text-gray-600`}>{docSoat ? 'Cambiar SOAT' : 'Subir SOAT'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity 
          onPress={handleSave}
          disabled={isLoading || fetchingOrgs}
          style={tw`bg-[#00327d] py-4 rounded-full items-center shadow-md shadow-blue-100 mt-2 flex-row justify-center`}
        >
          {isLoading && <ActivityIndicator color="white" style={tw`mr-2`} size="small" />}
          <Text style={tw`text-white font-extrabold text-sm uppercase tracking-widest`}>
            {isLoading ? (uploadStatus || 'Guardando...') : 'Completar Registro'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => {
            signOut();
          }}
          style={tw`py-4 mt-2 items-center`}
        >
          <Text style={tw`text-gray-400 font-extrabold text-xs uppercase tracking-widest`}>Cancelar y Salir</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function InputField({ label, placeholder, value, onChangeText, autoCapitalize = 'words' }: InputFieldProps) {
  return (
    <View style={tw`mb-4`}>
      <Text style={tw`text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1`}>{label}</Text>
      <TextInput
        style={tw`bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900 text-sm font-semibold`}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

