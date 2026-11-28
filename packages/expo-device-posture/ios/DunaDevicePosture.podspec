Pod::Spec.new do |s|
  s.name           = 'DunaDevicePosture'
  s.version        = '1.0.0'
  s.summary        = 'iPhone Duo fold and camera reserved regions for Duna Expo apps.'
  s.description    = 'Reports UIKit reserved regions (division and occlusion) and the hinge status for adaptive layout.'
  s.author         = 'Duna'
  s.homepage       = 'https://duna.coach'
  s.platforms      = { :ios => '26.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'UIKit'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION' => '5.10'
  }
  s.source_files = "**/*.{h,m,mm,swift}"
end
