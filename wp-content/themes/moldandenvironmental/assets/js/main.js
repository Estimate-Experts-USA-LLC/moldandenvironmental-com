// JavaScript Document

var $ = jQuery.noConflict();

// Owl Carousel

$(document).ready(function () {
  $('.navigation').singlePageNav({
    currentClass: 'active',
    speed: 1200,
    offset:100,
    //threshold:1120,
    filter: ':not(.external)'
});
  
});

$(".portfolio").magnificPopup({
  delegate: "a", // child items selector, by clicking on it popup will open
  type: "image",
  // other options
  gallery: {
    enabled: true,
  },
  image: {
    // options for image content type
    titleSrc: "title",
  },
});

// Isotope Section
jQuery(window).load(function () {
  jQuery('.portfolio').isotope({
      masonry: {
          columnWidth: 1,
      },
      itemSelector: '.grid-item',
      percentPosition: true,
  });

  
});

jQuery(window).bind('scroll', function() {
  var navHeight = 200 - 70;
     if (jQuery(window).scrollTop() > navHeight) {
      jQuery('.site-header').addClass('fixed');
     }
     else {
      jQuery('.site-header').removeClass('fixed');
     }
  });

