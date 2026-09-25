Pod::Spec.new do |s|
  s.name           = 'widget-reload'
  s.version        = '1.0.0'
  s.summary        = 'Reload MyExp widget timelines from JavaScript'
  s.homepage       = 'https://github.com/gagan987123/MyExp'
  s.license        = { :type => 'MIT' }
  s.authors        = 'MyExp'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = 'ios/**/*.{h,m,mm,swift}'
end
