Pod::Spec.new do |s|
  s.name           = 'DunaHealthKit'
  s.version        = '1.0.0'
  s.summary        = 'Privacy-preserving, read-only Apple Health sync for Duna.'
  s.description    = 'Reads player-selected performance data with incremental HealthKit queries. Duna never writes to Apple Health.'
  s.author         = 'Duna'
  s.homepage       = 'https://duna.coach'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
