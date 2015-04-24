// requires: validation-common.js

/**
 * Angular-Validation Service (ghiscoding)
 * https://github.com/ghiscoding/angular-validation
 *
 * @author: Ghislain B.
 * @desc: angular-validation service definition
 * Provide a way to programmatically create validators and validate a form directly from within the controller.
 * This Service is totally independant from the Directive, it could be used separately but the minimum it needs is the `validation-rules.js` file.
 */
angular
	.module('ghiscoding.validation')
	.service('validationService', ['$timeout', 'validationCommon', function ($timeout, validationCommon) {
    // global variables of our object
    var validationAttrs;  // Current Validator attributes
    var commonObj;        // Object of validationCommon service
    var timer;            // timer of user inactivity time
    var blurHandler;
    var isValidationCancelled = false;

    // service constructor
    var validationService = function() {
      this.validationAttrs = {};
      this.commonObj = new validationCommon();
    }

    // list of available published public functions of this object
    validationService.prototype.addValidator = addValidator;            // add a Validator to current element
    validationService.prototype.checkFormValidity = checkFormValidity;  // check the form validity (can be called by an empty validationService and used by both Directive/Service)
    validationService.prototype.removeValidator = removeValidator;      // remove a Validator from an element
    validationService.prototype.setGlobalOptions = setGlobalOptions;    // set and initialize global options used by all validators
    validationService.prototype.clearInvalidValidatorsInSummary = clearInvalidValidatorsInSummary; // clear clearInvalidValidatorsInSummary

    return validationService;

	  //----
		// Public Functions declaration
		//----------------------------------

		/** Add a validator on a form element, the argument could be passed as 2 string arguments or 1 single object embedding the properties
     * @param mixed var1: could be a string (element name) or an object representing the validator
		 * @param mixed var2: could be a string (element name)
		 */
		function addValidator(var1, var2) {
      var self = this;
      var attrs = {};

      // find if user provided 2 string arguments else it will be a single object with all properties
      if(typeof var1 === "string" && typeof var2 === "string") {
        attrs.elmName = var1;
        attrs.rules = var2;
      }else {
        attrs = var1;
      }

      // Make sure that we have all required attributes to function properly
      if(typeof attrs !== "object" || !attrs.hasOwnProperty('elmName') || !attrs.hasOwnProperty('rules') || (!attrs.hasOwnProperty('scope') && typeof self.validationAttrs.scope === "undefined") ) {
        throw 'Angular-Validation-Service requires at least the following 3 attributes: {elmName, rules, scope}';
      }

      // find the DOM element & make sure it's a filled object before going further
      // we will exclude disabled/ng-disabled element from being validated
      attrs.elm = angular.element(document.querySelector('[name="'+attrs.elmName+'"]:not([disabled]):not([ng-disabled]'));
      if(typeof attrs.elm !== "object" || attrs.elm.length === 0) {
        return self;
      }

      // copy the element attributes name to use throughout validationCommon
      // when using dynamic elements, we might have encounter unparsed or uncompiled data, we need to get Angular result with $interpolate
      if(new RegExp("{{(.*?)}}").test(attrs.elmName)) {
        attrs.elmName = $interpolate(attrs.elmName)(attrs.scope);
      }
      attrs.name = attrs.elmName;

      // onBlur make validation without waiting
      attrs.elm.bind('blur', blurHandler = function(event) {
        if(!isValidationCancelled) {
          // re-initialize to use current element & remove waiting time & validate
          self.commonObj.initialize(attrs.scope, attrs.elm, attrs, attrs.ctrl);
          self.commonObj.typingLimit = 0;
          attemptToValidate(self, event.target.value);
        }
      });

      // merge both attributes but 2nd object (attrs) as higher priority, so that for example debounce property inside `attrs` as higher priority over `validatorAttrs`
      // so the position inside the mergeObject call is very important
      attrs = mergeObjects(self.validationAttrs, attrs);

      // watch the element for any value change, validate it once that happen
			attrs.scope.$watch(attrs.elmName, function (newVal, oldVal) {
        // when previous value was set and new value is not, this is most probably an invalid character entered in a type input="text"
        // we will still call the `.validate()` function so that it shows also the possible other error messages
        if(newVal === undefined && oldVal !== undefined) {
          $timeout.cancel(self.timer);
          self.commonObj.ctrl.$setValidity('validation', self.commonObj.validate('', true));
          return;
        }
        // from the DOM element, find the Angular controller of this element & add value as well to list of attribtues
        attrs.ctrl = angular.element(attrs.elm).controller('ngModel');
        attrs.value = newVal;

        self.commonObj.initialize(attrs.scope, attrs.elm, attrs, attrs.ctrl);
        attemptToValidate(self, newVal);
		  }, true); // $watch()

      return self;
		} // addValidator()

    /** Check the form validity (can be called by an empty validationService and used by both Directive/Service)
     * Loop through Validation Summary and if any errors found then display them and return false on current function
     * @param object Angular Form or Scope Object
     * @return bool isFormValid
     */
    function checkFormValidity(obj) {
      var self = this;
      var ctrl, elm, elmName = '', isValid = true;
      if(typeof obj === "undefined" || typeof obj.$validationSummary === "undefined") {
        throw 'checkFormValidity() requires a valid Angular Form or $scope object passed as argument to function properly (ex.: $scope.form1  OR  $scope).';
      }

      // loop through $validationSummary and display errors when found on each field
      for(var i = 0, ln = obj.$validationSummary.length; i < ln; i++) {
        isValid = false;
        elmName = obj.$validationSummary[i].field;

        if(!!elmName) {
          // get the form element custom object and use it after
          var formElmObj = self.commonObj.getFormElementByName(elmName);

          if(!!formElmObj.elm && formElmObj.elm.length > 0) {
            formElmObj.ctrl.$setTouched(); // make the element as it was touched for CSS
            self.commonObj.updateErrorMsg(obj.$validationSummary[i].message, { isSubmitted: true, isValid: formElmObj.isValid, obj: formElmObj });
          }
        }
      }
      return isValid;
    }

    /** Remove all objects in validationsummary and matching objects in FormElementList.
     * This is for use in a wizard type setting, where you 'move back' to a previous page in wizard.
     * In this case you need to remove invalid validators that will exist in 'the future'.
     * @param object Angular Form or Scope Object
     */
    function clearInvalidValidatorsInSummary(obj) {
      var self = this;
      if (typeof obj === "undefined" || typeof obj.$validationSummary === "undefined") {
        throw 'checkFormValidity() requires a valid Angular Form or $scope object passed as argument to function properly (ex.: $scope.form1  OR  $scope).';
      }
      // Get list of names to remove
      var elmName = [];
      for (var i = 0, ln = obj.$validationSummary.length; i < ln; i++) {
        elmName.push(obj.$validationSummary[i].field);
      }
      // Loop on list of names. Cannot loop on obj.$validationSummary as you are removing objects from it in the loop.
      for (i = 0, ln = elmName.length; i < ln; i++) {
        if (!!elmName[i]) {
          self.commonObj.removeFromFormElementObjectList(elmName[i]);
          self.commonObj.removeFromValidationSummary(obj.$validationSummary, elmName[i]);
        }
      }
    }

    /** Remove a watcher
     * @param object Angular Form or Scope Object
     * @param array/string of element name(s) (name attribute)
     * @return object self
     */
    function removeValidator(obj, attrs) {
      var self = this;
      var formElmObj;

      if(typeof obj === "undefined" || typeof obj.$validationSummary === "undefined") {
        throw 'checkFormValidity() requires a valid Angular Form or $scope object passed as argument to function properly (ex.: $scope.form1  OR  $scope).';
      }

      if(attrs instanceof Array) {
        // when passed as array, loop through all elements to be removed
        for(var i = 0, ln = attrs.length; i < ln; i++) {
          formElmObj = self.commonObj.getFormElementByName(attrs[i]);
          removeWatcher(self, formElmObj, obj.$validationSummary);
        }
      }else {
        formElmObj = self.commonObj.getFormElementByName(attrs);
        removeWatcher(self, formElmObj, obj.$validationSummary);
      }

      return self;
    }

    /** Set and initialize global options used by all validators
     * @param object attrs: global options
     * @return object self
     */
    function setGlobalOptions(attrs) {
      var self = this;
      self.validationAttrs = attrs; // save in global

      return self;
    }

    //----
    // Private functions declaration
    //----------------------------------

    /** Validator function to attach to the element, this will get call whenever the input field is updated
     *  and is also customizable through the (typing-limit) for which inactivity this.timer will trigger validation.
     * @param object self
     * @param string value: value of the input field
     */
    function attemptToValidate(self, value) {
      // pre-validate without any events just to pre-fill our validationSummary with all field errors
      // passing false as 2nd argument for not showing any errors on screen
      self.commonObj.validate(value, false);

      // if field is not required and his value is empty, cancel validation and exit out
      if(!self.commonObj.isFieldRequired() && (value === "" || value === null || typeof value === "undefined")) {
        cancelValidation(self);
        return value;
      }else {
        isValidationCancelled = false;
      }

      // invalidate field before doing any validation
      if(self.commonObj.isFieldRequired() || !!value) {
        self.commonObj.ctrl.$setValidity('validation', false);
      }

      // if a field holds invalid characters which are not numbers inside an `input type="number"`, then it's automatically invalid
      // we will still call the `.validate()` function so that it shows also the possible other error messages
      if((value === "" || typeof value === "undefined") && self.commonObj.elm.prop('type').toUpperCase() === "NUMBER") {
        $timeout.cancel(self.timer);
        self.commonObj.ctrl.$setValidity('validation', self.commonObj.validate(value, true));
        return value;
      }

      // select(options) will be validated on the spot
      if(self.commonObj.elm.prop('tagName').toUpperCase() === "SELECT") {
        self.commonObj.ctrl.$setValidity('validation', self.commonObj.validate(value, true));
        return value;
      }

      // onKeyDown event is the default of Angular, no need to even bind it, it will fall under here anyway
      // in case the field is already pre-filled, we need to validate it without looking at the event binding
      if(typeof value !== "undefined") {
        // Make the validation only after the user has stopped activity on a field
        // everytime a new character is typed, it will cancel/restart the timer & we'll erase any error mmsg
        self.commonObj.updateErrorMsg('');
        $timeout.cancel(self.timer);
        self.timer = $timeout(function() {
          self.commonObj.scope.$evalAsync(self.commonObj.ctrl.$setValidity('validation', self.commonObj.validate(value, true) ));
        }, self.commonObj.typingLimit);
      }

      return value;
    } // attemptToValidate()

    /** Cancel current validation test and blank any leftover error message
     * @param object obj
     */
    function cancelValidation(obj) {
      isValidationCancelled = true;
      $timeout.cancel(self.timer);
      obj.commonObj.updateErrorMsg('');
      obj.commonObj.ctrl.$setValidity('validation', true);

      // unbind onBlur handler (if found) so that it does not fail on a non-required element that is now dirty & empty
      if(typeof blurHandler !== "undefined") {
        obj.commonObj.elm.unbind('blur', blurHandler);
      }
    }

    /**
     * Overwrites obj1's values with obj2's and adds obj2's if non existent in obj1
     * @param obj1
     * @param obj2
     * @return obj3 a new object based on obj1 and obj2
     */
    function mergeObjects(obj1, obj2) {
      var obj3 = {};
      for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
      for (var attrname in obj2) { obj3[attrname] = obj2[attrname]; }

      return obj3;
    }

    /** Remove a watcher
     * @param object self
     * @param object formElmObj: form element object
     * @param object validationSummary
     */
    function removeWatcher(self, formElmObj, validationSummary) {
      if(typeof self.commonObj.scope === "undefined") {
        return;
      }
      // unbind the $watch
      var unbindWatcher = self.commonObj.scope.$watch(formElmObj.fieldName, function (newVal, oldVal) {}); // $watch()
      unbindWatcher();

      // also unbind the blur directly applied on element
      //formElmObj.elm.unbind();

      // now to remove any errors, we need to make the element untouched, pristine and remove the validation
      // also remove it from the validationSummary list and remove any displayed error
      formElmObj.ctrl.$setUntouched();
      formElmObj.ctrl.$setPristine();
      formElmObj.ctrl.$setValidity('validation', true);
      self.commonObj.removeFromValidationSummary(validationSummary, formElmObj.fieldName);
      self.commonObj.updateErrorMsg('', { isValid: true, obj: formElmObj });
    }

}]); // validationService