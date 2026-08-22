Pod::Spec.new do |s|
  s.name           = 'DunaBackgroundUpload'
  s.version        = '1.0.0'
  s.summary        = 'File-backed durable multipart uploads for Duna Expo apps.'
  s.description    = 'Stages bounded source ranges to files and uploads them with a background URLSession.'
  s.author         = 'Duna'
  s.homepage       = 'https://duna.coach'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Foundation'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION' => '5.10'
  }
  s.source_files = "**/*.{h,m,mm,swift}"
end
