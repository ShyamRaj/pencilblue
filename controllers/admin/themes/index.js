function ThemesController(){}

//dependencies
var BaseController = pb.BaseController;
var DAO            = pb.DAO;

//inheritance
util.inherits(ThemesController, BaseController);


ThemesController.prototype.render = function(cb) {
	var self = this;
	
	//get plugs with themes
	pb.plugins.getPluginsWithThemes(function(err, themes) {
		if (util.isError(err)) {
			throw result;
		}
		
		//get active theme
		pb.settings.get('active_theme', function(err, activeTheme) {
			if (util.isError(err)) {
				throw err;
			}
			
			//add default pencil blue theme
			var options = pb.utils.copyArray(themes);
			options.push({
				uid: 'pencilblue',
				name: 'PencilBlue'
				
			});
			
			//setup angular
			var angularData = pb.js.getAngularController(
	            {
	                navigation: pb.AdminNavigation.get(self.session, ['plugins', 'themes'], self.ls),
	                tabs: self.getTabs(),
	                themes: themes,
	                options: options,
	                activeTheme: activeTheme
	            }, 
	            []
	        );
			
			//load the template
			//self.ts.registerLocal('angular_script', angularData);
			self.ts.registerLocal('uploaded_image', function(flag, callback) {
				pb.settings.get('site_logo', function(err, logo) {
					if (util.isError(err)) {
						pb.log.error("ThemesController: Failed to retrieve site logo: "+err.stack);
					}
					
					var imgUrl = '';
					if (logo) {
						if (pb.utils.isFullyQualifiedUrl(logo)) {
							imgUrl = logo;
						}
						else {
							imgUrl = pb.utils.urlJoin('/imgs', logo);
						}
					}
					callback(null, imgUrl);
				});
			});
			self.ts.registerLocal('image_title', ' ');
			self.ts.load('/admin/themes/index', function(err, content) {
				
				//TODO move angular out as flag & replacement when can add option to 
				//skip the check for replacements in replacement
				content = content.replace('^angular_script^', angularData);
				cb({content: content});
			});
		});
	});
};

ThemesController.prototype.getTabs = function() {
	return [
	        {
	            active: 'active',
	            href: '#themes',
	            icon: 'magic',
	            title: this.ls.get('THEMES')
	        },
	        {
	            href: '#site_logo',
	            icon: 'picture-o',
	            title: this.ls.get('SITE_LOGO')
	        }
	    ];
};

//exports
module.exports = ThemesController;
